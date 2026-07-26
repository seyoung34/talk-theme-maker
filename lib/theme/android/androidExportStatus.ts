import { createAdminClient } from "@/lib/supabase/server";
import { completeExportJob, failExportJob } from "@/lib/billing/credits";
import { getBuilderAccessToken, readBuilderConfig, type BuilderConfig } from "@/lib/theme/android/buildJobClient";

// 4.1~4.6: status 엔드포인트 핵심 로직. export_jobs 조회 → (필요 시) GCS result.json 조회 → 정산 → 서명 URL 발급.
// 정산 전 상태 확인(불변식 3)은 여기서 하고, 최종 방어(불변식 1·2)는 complete_export_job/fail_export_job RPC의
// `for update` + 상태 분기가 담당한다(이미 멱등 — §android-build-cloud-run-plan.md 감사 결과).

const signedUrlTtlSeconds = 300;
const watchdogStaleMs = Number.parseInt(process.env.ANDROID_EXPORT_WATCHDOG_MS ?? "", 10) || 25 * 60 * 1000;

export type AndroidExportStatusResult =
  | { kind: "not_found" }
  | { kind: "pending"; stage: string }
  | { kind: "completed"; downloadUrl: string; fileName: string }
  // reason은 사용자 메시지(error)와 별개로 실패 원인을 식별하는 코드다. 클라이언트가 분석 이벤트로
  // 올릴 때 허용 목록과 대조하므로, 여기서는 빌더가 준 코드를 있는 그대로 전달해도 안전하다.
  | { kind: "failed"; error: string; reason: string };

type ExportJobRow = {
  id: string;
  user_id: string;
  status: "pending" | "succeeded" | "failed";
  stage: string;
  file_name: string | null;
  error: string | null;
  error_code: string | null;
  created_at: string;
};

type ResultJson =
  | { status: "success"; export_job_id: string; output_path: string; fileName: string; bytes: number }
  | { status: "failed"; export_job_id?: string; errorCode: string };

export async function resolveAndroidExportStatus(userId: string, exportJobId: string): Promise<AndroidExportStatusResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,status,stage,file_name,error,error_code,created_at")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as ExportJobRow | null;
  if (!row) return { kind: "not_found" };

  if (row.status === "succeeded") {
    // 성공으로 정산됐는데 파일명이 없으면 빌드 실패가 아니라 정산 데이터 불일치다.
    if (!row.file_name) return { kind: "failed", error: "내보내기 결과 파일을 찾지 못했습니다.", reason: "server_error" };
    return { kind: "completed", downloadUrl: await signOutputUrl(exportJobId, row.file_name), fileName: row.file_name };
  }
  if (row.status === "failed") {
    return { kind: "failed", error: row.error ?? "내보내기 작업에 실패했습니다.", reason: row.error_code ?? "android_build_failed" };
  }

  // status === "pending": GCS result.json으로 완료/실패 여부를 확인한다.
  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  const result = await downloadResultJson(config, accessToken, exportJobId);

  if (!result) {
    if (Date.now() - new Date(row.created_at).getTime() > watchdogStaleMs) {
      // 4.5 워치독: Job이 결과를 남기지 못한 채(크래시·유실) 임계시간을 넘긴 pending을 강제 환불한다.
      await failExportJob({ userId, exportJobId, errorCode: "build_watchdog_timeout", errorMessage: "내보내기 작업이 시간 내에 끝나지 않았습니다.", durationMs: Date.now() - new Date(row.created_at).getTime() }).catch(() => undefined);
      return { kind: "failed", error: "내보내기 작업이 시간 내에 끝나지 않았습니다.", reason: "build_watchdog_timeout" };
    }
    return { kind: "pending", stage: row.stage };
  }

  const durationMs = Date.now() - new Date(row.created_at).getTime();
  if (result.status === "success") {
    // export_job_not_pending(동시 폴링으로 이미 정산됨)이면 그대로 완료 취급 — 멱등이라 안전.
    await completeExportJob({ userId, exportJobId, fileName: result.fileName, outputBytes: result.bytes, durationMs }).catch((settleError) => {
      if (!isAlreadySettled(settleError)) throw settleError;
    });
    return { kind: "completed", downloadUrl: await signOutputUrl(exportJobId, result.fileName), fileName: result.fileName };
  }

  const errorMessage = "내보내기 작업에 실패했습니다.";
  const errorCode = result.errorCode || "android_build_failed";
  await failExportJob({ userId, exportJobId, errorCode, errorMessage, durationMs }).catch((settleError) => {
    if (!isAlreadySettled(settleError)) throw settleError;
  });
  return { kind: "failed", error: errorMessage, reason: errorCode };
}

function isAlreadySettled(error: unknown) {
  return error instanceof Error && error.message.includes("export_job_not_pending");
}

async function downloadResultJson(config: BuilderConfig, accessToken: string, exportJobId: string): Promise<ResultJson | null> {
  const objectName = `${exportJobId}/result.json`;
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.outputBucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("gcs_result_read_failed");
  return (await response.json()) as ResultJson;
}

/**
 * 완료된 내보내기를 나중에 다시 받는 경로.
 *
 * 폴링하던 탭이 닫히면 서명 URL은 사라지지만 결과 파일은 보관 기간 동안 버킷에 남아 있다.
 * 크레딧은 이미 차감된 뒤이므로 사용자가 결과를 받을 방법이 남아 있어야 한다.
 * 보관 기간이 지난 결과를 성공처럼 보여주면 눌렀을 때 404가 나므로 객체 존재를 먼저 확인한다.
 */
export type AndroidExportDownloadResult =
  | { kind: "not_found" }
  | { kind: "not_ready" }
  | { kind: "expired" }
  | { kind: "ready"; downloadUrl: string; fileName: string };

export async function resolveAndroidExportDownload(userId: string, exportJobId: string): Promise<AndroidExportDownloadResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,platform,status,file_name")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as Pick<ExportJobRow, "id" | "user_id" | "status" | "file_name"> & { platform: string } | null;
  // 소유자 조건을 쿼리에 넣었으므로 남의 작업은 여기서 not_found가 된다.
  if (!row) return { kind: "not_found" };
  if (row.platform !== "android" || row.status !== "succeeded" || !row.file_name) return { kind: "not_ready" };

  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  const objectPath = `${exportJobId}/${row.file_name}`;
  if (!(await outputObjectExists(config, accessToken, objectPath))) return { kind: "expired" };

  return { kind: "ready", downloadUrl: await signOutputObject(config, accessToken, objectPath), fileName: row.file_name };
}

async function outputObjectExists(config: BuilderConfig, accessToken: string, objectPath: string) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.outputBucket)}/o/${encodeURIComponent(objectPath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("gcs_output_lookup_failed");
  return true;
}

// 불변식 5: DB에는 오브젝트 경로만 저장하고, 다운로드 때마다 짧은 TTL의 GCS V4 서명 URL을 온디맨드로 새로 발급한다.
// SA JSON 키 없이 IAM Credentials API의 signBlob으로 서명(WIF impersonation 토큰 재사용).
async function signOutputUrl(exportJobId: string, fileName: string) {
  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  return signOutputObject(config, accessToken, `${exportJobId}/${fileName}`);
}

async function signOutputObject(config: BuilderConfig, accessToken: string, objectPath: string) {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const timestamp = `${dateStamp}T${now.toISOString().slice(11, 19).replaceAll(":", "")}Z`;
  const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
  const credential = `${config.builderServiceAccount}/${credentialScope}`;

  // objectPath의 "/"는 실제 경로 구분자다 — 전체를 한 번에 encodeURIComponent하면 "/"까지 %2F로
  // 이스케이프되어 실제 오브젝트 이름과 어긋난 경로가 만들어진다. 세그먼트별로만 인코딩한다.
  const canonicalUri = `/${config.outputBucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const queryParams: [string, string][] = [
    ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", timestamp],
    ["X-Goog-Expires", String(signedUrlTtlSeconds)],
    ["X-Goog-SignedHeaders", "host"],
  ];
  const canonicalQueryString = queryParams
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalHeaders = "host:storage.googleapis.com\n";
  const canonicalRequest = ["GET", canonicalUri, canonicalQueryString, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ["GOOG4-RSA-SHA256", timestamp, credentialScope, hashedCanonicalRequest].join("\n");

  const signatureHex = await signBlob(config.builderServiceAccount, accessToken, stringToSign);
  return `https://storage.googleapis.com${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
}

async function signBlob(serviceAccount: string, accessToken: string, payload: string) {
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signBlob`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: base64Encode(new TextEncoder().encode(payload)) }),
    },
  );
  const body = (await response.json().catch(() => null)) as { signedBlob?: string } | null;
  if (!response.ok || !body?.signedBlob) throw new Error("sign_blob_failed");
  return toHex(base64Decode(body.signedBlob));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Buffer(Node 전용) 대신 순수 JS로 구현 — 이 파일은 향후 엣지 런타임(Cloudflare) 이전 대상이다.
function base64Encode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
