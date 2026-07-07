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
  | { kind: "failed"; error: string };

type ExportJobRow = {
  id: string;
  user_id: string;
  status: "pending" | "succeeded" | "failed";
  stage: string;
  file_name: string | null;
  error: string | null;
  created_at: string;
};

type ResultJson =
  | { status: "success"; export_job_id: string; output_path: string; fileName: string; bytes: number }
  | { status: "failed"; export_job_id?: string; errorCode: string };

export async function resolveAndroidExportStatus(userId: string, exportJobId: string): Promise<AndroidExportStatusResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,status,stage,file_name,error,created_at")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as ExportJobRow | null;
  if (!row) return { kind: "not_found" };

  if (row.status === "succeeded") {
    if (!row.file_name) return { kind: "failed", error: "내보내기 결과 파일을 찾지 못했습니다." };
    return { kind: "completed", downloadUrl: await signOutputUrl(exportJobId, row.file_name), fileName: row.file_name };
  }
  if (row.status === "failed") {
    return { kind: "failed", error: row.error ?? "내보내기 작업에 실패했습니다." };
  }

  // status === "pending": GCS result.json으로 완료/실패 여부를 확인한다.
  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  const result = await downloadResultJson(config, accessToken, exportJobId);

  if (!result) {
    if (Date.now() - new Date(row.created_at).getTime() > watchdogStaleMs) {
      // 4.5 워치독: Job이 결과를 남기지 못한 채(크래시·유실) 임계시간을 넘긴 pending을 강제 환불한다.
      await failExportJob({ userId, exportJobId, errorCode: "build_watchdog_timeout", errorMessage: "내보내기 작업이 시간 내에 끝나지 않았습니다.", durationMs: Date.now() - new Date(row.created_at).getTime() }).catch(() => undefined);
      return { kind: "failed", error: "내보내기 작업이 시간 내에 끝나지 않았습니다." };
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
  await failExportJob({ userId, exportJobId, errorCode: result.errorCode || "android_build_failed", errorMessage, durationMs }).catch((settleError) => {
    if (!isAlreadySettled(settleError)) throw settleError;
  });
  return { kind: "failed", error: errorMessage };
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

// 불변식 5: DB에는 오브젝트 경로만 저장하고, 다운로드 때마다 짧은 TTL의 GCS V4 서명 URL을 온디맨드로 새로 발급한다.
// SA JSON 키 없이 IAM Credentials API의 signBlob으로 서명(WIF impersonation 토큰 재사용).
async function signOutputUrl(exportJobId: string, fileName: string) {
  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  const objectPath = `${exportJobId}/${fileName}`;

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
