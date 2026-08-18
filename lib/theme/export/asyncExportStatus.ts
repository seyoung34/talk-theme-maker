import { createAdminClient } from "@/lib/supabase/server";
import { completeExportJob, failExportJob } from "@/lib/billing/credits";
import { getBuilderAccessToken, readBuilderConfig, type BuilderConfig } from "@/lib/theme/export/buildJobClient";

const signedUrlTtlSeconds = 300;

export type AsyncExportPlatform = "android" | "ios";

export type AsyncExportStatusResult =
  | { kind: "not_found" }
  | { kind: "pending"; stage: string }
  | { kind: "completed"; downloadUrl: string; fileName: string }
  | { kind: "failed"; error: string; reason: string };

export type AsyncExportDownloadResult =
  | { kind: "not_found" }
  | { kind: "not_ready" }
  | { kind: "expired" }
  | { kind: "ready"; downloadUrl: string; fileName: string };

type ExportJobRow = {
  id: string;
  user_id: string;
  platform: AsyncExportPlatform;
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

export async function resolveExportStatus(userId: string, exportJobId: string, platform: AsyncExportPlatform): Promise<AsyncExportStatusResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,platform,status,stage,file_name,error,error_code,created_at")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  const row = data as ExportJobRow | null;
  if (!row) return { kind: "not_found" };

  if (row.status === "succeeded") {
    if (!row.file_name) return { kind: "failed", error: "내보내기 결과 파일을 찾지 못했습니다.", reason: "server_error" };
    return { kind: "completed", downloadUrl: await signOutputUrl(platform, exportJobId, row.file_name), fileName: row.file_name };
  }
  if (row.status === "failed") {
    return { kind: "failed", error: row.error ?? "내보내기 작업에 실패했습니다.", reason: row.error_code ?? fallbackBuildFailureReason(platform) };
  }

  const config = readPlatformBuilderConfig(platform);
  const accessToken = await getBuilderAccessToken(config);
  const result = await downloadResultJson(config, accessToken, exportJobId);

  if (!result) {
    const watchdogStaleMs = getWatchdogStaleMs(platform);
    if (Date.now() - new Date(row.created_at).getTime() > watchdogStaleMs) {
      await failExportJob({
        userId,
        exportJobId,
        errorCode: "build_watchdog_timeout",
        errorMessage: "내보내기 작업이 시간 내에 끝나지 않았습니다.",
        durationMs: Date.now() - new Date(row.created_at).getTime(),
      }).catch(() => undefined);
      return { kind: "failed", error: "내보내기 작업이 시간 내에 끝나지 않았습니다.", reason: "build_watchdog_timeout" };
    }
    return { kind: "pending", stage: row.stage };
  }

  const durationMs = Date.now() - new Date(row.created_at).getTime();
  if (result.status === "success") {
    await completeExportJob({ userId, exportJobId, fileName: result.fileName, outputBytes: result.bytes, durationMs }).catch((settleError) => {
      if (!isAlreadySettled(settleError)) throw settleError;
    });
    return { kind: "completed", downloadUrl: await signOutputUrl(platform, exportJobId, result.fileName), fileName: result.fileName };
  }

  const errorMessage = "내보내기 작업에 실패했습니다.";
  const errorCode = result.errorCode || fallbackBuildFailureReason(platform);
  await failExportJob({ userId, exportJobId, errorCode, errorMessage, durationMs }).catch((settleError) => {
    if (!isAlreadySettled(settleError)) throw settleError;
  });
  return { kind: "failed", error: errorMessage, reason: errorCode };
}

export async function resolveExportDownload(userId: string, exportJobId: string, platform: AsyncExportPlatform): Promise<AsyncExportDownloadResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,platform,status,file_name")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  const row = data as Pick<ExportJobRow, "id" | "user_id" | "platform" | "status" | "file_name"> | null;
  if (!row) return { kind: "not_found" };
  if (row.status !== "succeeded" || !row.file_name) return { kind: "not_ready" };

  const config = readPlatformBuilderConfig(platform);
  const accessToken = await getBuilderAccessToken(config);
  const objectPath = `${exportJobId}/${row.file_name}`;
  if (!(await outputObjectExists(config, accessToken, objectPath))) return { kind: "expired" };

  return { kind: "ready", downloadUrl: await signOutputObject(config, accessToken, objectPath), fileName: row.file_name };
}

function readPlatformBuilderConfig(platform: AsyncExportPlatform) {
  return readBuilderConfig({ jobNameEnv: platform === "ios" ? "GCP_IOS_BUILD_JOB_NAME" : "GCP_BUILD_JOB_NAME" });
}

function getWatchdogStaleMs(platform: AsyncExportPlatform) {
  const envName = platform === "ios" ? "IOS_EXPORT_WATCHDOG_MS" : "ANDROID_EXPORT_WATCHDOG_MS";
  return Number.parseInt(process.env[envName] ?? process.env.EXPORT_WATCHDOG_MS ?? "", 10) || 25 * 60 * 1000;
}

function fallbackBuildFailureReason(platform: AsyncExportPlatform) {
  return platform === "ios" ? "ios_export_failed" : "android_build_failed";
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

async function outputObjectExists(config: BuilderConfig, accessToken: string, objectPath: string) {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.outputBucket)}/o/${encodeURIComponent(objectPath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("gcs_output_lookup_failed");
  return true;
}

async function signOutputUrl(platform: AsyncExportPlatform, exportJobId: string, fileName: string) {
  const config = readPlatformBuilderConfig(platform);
  const accessToken = await getBuilderAccessToken(config);
  return signOutputObject(config, accessToken, `${exportJobId}/${fileName}`);
}

async function signOutputObject(config: BuilderConfig, accessToken: string, objectPath: string) {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const timestamp = `${dateStamp}T${now.toISOString().slice(11, 19).replaceAll(":", "")}Z`;
  const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
  const credential = `${config.builderServiceAccount}/${credentialScope}`;
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
