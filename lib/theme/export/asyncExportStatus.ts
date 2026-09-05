import { createAdminClient } from "@/lib/supabase/server";
import {
  cancelExportJob,
  claimExportRecovery,
  completeExportJob,
  failExportJobIfPending,
  updateExportJobEnqueueState,
  type ExportEnqueueState,
} from "@/lib/billing/credits";
import { createExportFailureEvent } from "@/lib/ops/eventFactories";
import { scheduleOpsEvent } from "@/lib/ops/dispatcher";
import {
  BuildEnqueueError,
  findBuilderExecution,
  getBuilderAccessToken,
  inspectBuilderInput,
  readBuilderConfig,
  runBuilderJob,
  type BuilderConfig,
} from "@/lib/theme/export/buildJobClient";

const signedUrlTtlSeconds = 300;
const resultJsonRequestTimeoutMs = 15_000;
// This matches reserve_export_credit's stale-reservation cutoff. Recovery must
// begin before a new export reservation is allowed to settle the old job.
const enqueueRecoveryStaleMs = 10 * 60 * 1000;

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
  enqueue_state: ExportEnqueueState;
  enqueue_attempt: number;
  builder_operation_name: string | null;
  builder_execution_name: string | null;
  input_completed_at: string | null;
  triggered_at: string | null;
  builder_started_at: string | null;
  last_heartbeat_at: string | null;
  recovery_reason: string | null;
  cancel_requested_at: string | null;
};

type ResultJson =
  | { status: "success"; export_job_id: string; output_path: string; fileName: string; bytes: number }
  | { status: "failed"; export_job_id?: string; errorCode: string };

export async function resolveExportStatus(userId: string, exportJobId: string, platform: AsyncExportPlatform): Promise<AsyncExportStatusResult> {
  const row = await readExportJob(userId, exportJobId, platform);
  if (!row) return { kind: "not_found" };

  if (row.status !== "pending") return resolveSettledExportStatus(row, platform, exportJobId);

  // A cancellation request is settled before doing more external work. The
  // RPC is conditional, so a builder/result transition that won the race is
  // preserved and no second refund is issued.
  if (row.cancel_requested_at) return resolveCancellation(userId, exportJobId, platform, row);

  const config = readPlatformBuilderConfig(platform);
  const accessToken = await getBuilderAccessToken(config);
  const result = await downloadResultJson(config, accessToken, exportJobId);

  if (!result) {
    const durationMs = Date.now() - new Date(row.created_at).getTime();
    if (durationMs > enqueueRecoveryStaleMs) {
      const recovery = await reconcileExportEnqueue({ userId, exportJobId, platform, row, config, accessToken, durationMs });
      if (recovery.kind === "pending") return { kind: "pending", stage: recovery.stage };
      if (recovery.kind === "failed") return recovery.result;
      if (recovery.kind === "settled") return recovery.result;
    }

    // The recovery threshold is deliberately earlier than the terminal
    // watchdog. Existing Cloud Run work must remain observable until its
    // normal timeout rather than being failed at the reservation cutoff.
    if (durationMs > getWatchdogStaleMs(platform)) {
      const settlement = await failExportJobIfPending({
        userId,
        exportJobId,
        errorCode: "build_watchdog_timeout",
        errorMessage: "내보내기 작업이 시간 내에 끝나지 않았습니다.",
        durationMs,
      }).catch((settleError) => {
        console.error("[export-watchdog] transition_failed", {
          exportJobId,
          platform,
          name: settleError instanceof Error ? settleError.name : "unknown",
        });
        return null;
      });
      if (settlement?.transitioned) {
        scheduleOpsEvent(createExportFailureEvent({
          platform,
          exportJobId,
          errorCode: "build_watchdog_timeout",
          durationMs,
          watchdog: true,
        }));
        return { kind: "failed", error: "내보내기 작업이 시간 내에 끝나지 않았습니다.", reason: "build_watchdog_timeout" };
      }

      // Another status request may have completed or failed the job while this request was
      // downloading the result. Re-read before deciding what the caller should see and never
      // publish a watchdog alert for a transition this invocation did not win.
      const latestRow = await readExportJob(userId, exportJobId, platform);
      if (!latestRow) return { kind: "not_found" };
      if (latestRow.status !== "pending") return resolveSettledExportStatus(latestRow, platform, exportJobId);
      return { kind: "pending", stage: latestRow.stage };
    }
    return { kind: "pending", stage: row.stage };
  }

  const durationMs = Date.now() - new Date(row.created_at).getTime();
  if (result.status === "success") {
    try {
      await completeExportJob({ userId, exportJobId, fileName: result.fileName, outputBytes: result.bytes, durationMs });
    } catch (settleError) {
      if (!isAlreadySettled(settleError)) throw settleError;
      const latestRow = await readExportJob(userId, exportJobId, platform);
      if (!latestRow) return { kind: "not_found" };
      if (latestRow.status === "pending" && latestRow.cancel_requested_at) return resolveCancellation(userId, exportJobId, platform, latestRow);
      if (latestRow.status !== "succeeded") return { kind: "pending", stage: latestRow.stage };
    }
    return { kind: "completed", downloadUrl: await signOutputUrl(platform, exportJobId, result.fileName), fileName: result.fileName };
  }

  const errorMessage = "내보내기 작업에 실패했습니다.";
  const errorCode = result.errorCode || fallbackBuildFailureReason(platform);
  const settlement = await failExportJobIfPending({ userId, exportJobId, errorCode, errorMessage, durationMs });
  if (!settlement.transitioned) {
    const latestRow = await readExportJob(userId, exportJobId, platform);
    if (!latestRow) return { kind: "not_found" };
    if (latestRow.status !== "failed") return resolveSettledExportStatus(latestRow, platform, exportJobId);
  } else {
    scheduleExportFailureEvent(platform, exportJobId, errorCode, durationMs);
  }
  return { kind: "failed", error: errorMessage, reason: errorCode };
}

type ExportEnqueueRecoveryResult =
  | { kind: "pending"; stage: string }
  | { kind: "continue" }
  | { kind: "failed"; result: Extract<AsyncExportStatusResult, { kind: "failed" }> }
  | { kind: "settled"; result: AsyncExportStatusResult };

async function reconcileExportEnqueue({
  userId,
  exportJobId,
  platform,
  row,
  config,
  accessToken,
  durationMs,
}: {
  userId: string;
  exportJobId: string;
  platform: AsyncExportPlatform;
  row: ExportJobRow;
  config: BuilderConfig;
  accessToken: string;
  durationMs: number;
}): Promise<ExportEnqueueRecoveryResult> {
  // A stored operation/execution means the original trigger reached Cloud Run.
  // Never issue another run request in that case; result.json remains the
  // source of truth for completion.
  if (row.builder_operation_name || row.builder_execution_name || row.enqueue_state === "triggered" || (row.enqueue_state === "running" && !row.builder_started_at)) {
    if (row.builder_execution_name) {
      await updateExportJobEnqueueState({
        userId,
        exportJobId,
        state: "running",
        lastHeartbeatAt: new Date().toISOString(),
      });
    }
    return { kind: "continue" };
  }

  const execution = await findBuilderExecution(config, accessToken, exportJobId, { createdAt: row.created_at });
  if (execution) {
    await updateExportJobEnqueueState({
      userId,
      exportJobId,
      state: "running",
      builderExecutionName: execution.name,
      builderStartedAt: execution.createTime ?? new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });
    return { kind: "pending", stage: "building" };
  }

  // The migration backfills old rows as `running`/`triggered`; those rows do
  // not carry EXPORT_JOB_ID and must not receive a speculative duplicate run.
  if (!isRecoveryEligible(row)) return { kind: "continue" };

  const inspection = await inspectBuilderInput(config, accessToken, exportJobId);
  if (!inspection.complete) {
    return settleRecoveryFailure({
      userId,
      exportJobId,
      platform,
      errorCode: "input_upload_incomplete",
      errorMessage: "빌드 입력 업로드가 완료되지 않아 내보내기를 진행하지 못했습니다.",
      durationMs,
    });
  }

  if (row.enqueue_attempt >= 1) return { kind: "continue" };
  const claim = await claimExportRecovery({ userId, exportJobId, expectedAttempt: row.enqueue_attempt });
  if (!claim.claimed) {
    const latestRow = await readExportJob(userId, exportJobId, platform);
    if (!latestRow) return { kind: "settled", result: { kind: "not_found" } };
    if (latestRow.status !== "pending") {
      return { kind: "settled", result: await resolveSettledExportStatus(latestRow, platform, exportJobId) };
    }
    return { kind: "pending", stage: latestRow.stage };
  }

  try {
    const run = await runBuilderJob(config, accessToken, {
      inputUri: `gs://${config.inputBucket}/${exportJobId}`,
      outputUri: `gs://${config.outputBucket}/${exportJobId}`,
      exportJobId,
      attempt: claim.enqueueAttempt,
    });
    const now = new Date().toISOString();
    const updated = await updateExportJobEnqueueState({
      userId,
      exportJobId,
      state: run.operationName ? "triggered" : "trigger_ambiguous",
      builderOperationName: run.operationName,
      triggeredAt: now,
      lastHeartbeatAt: now,
      recoveryReason: run.operationName ? null : "missing_cloud_run_operation_name",
    });
    if (!updated) return { kind: "settled", result: await resolveRecoverySettlement(userId, exportJobId, platform) };
    return { kind: "pending", stage: "queued" };
  } catch (error) {
    if (error instanceof BuildEnqueueError && error.ambiguous) {
      await updateExportJobEnqueueState({
        userId,
        exportJobId,
        state: "trigger_ambiguous",
        triggeredAt: new Date().toISOString(),
        recoveryReason: "ambiguous_cloud_run_response",
      }).catch(() => undefined);
      return { kind: "pending", stage: "queued" };
    }
    return settleRecoveryFailure({
      userId,
      exportJobId,
      platform,
      errorCode: "enqueue_recovery_failed",
      errorMessage: "빌드 작업을 다시 시작하지 못했습니다.",
      durationMs,
    });
  }
}

function isRecoveryEligible(row: ExportJobRow) {
  return row.enqueue_attempt < 1 && [
    "reserved",
    "uploading",
    "input_ready",
    "triggering",
    "trigger_ambiguous",
    "reconciling",
  ].includes(row.enqueue_state);
}

async function settleRecoveryFailure({
  userId,
  exportJobId,
  platform,
  errorCode,
  errorMessage,
  durationMs,
}: {
  userId: string;
  exportJobId: string;
  platform: AsyncExportPlatform;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
}): Promise<ExportEnqueueRecoveryResult> {
  const settlement = await failExportJobIfPending({
    userId,
    exportJobId,
    errorCode,
    errorMessage,
    durationMs,
  });
  if (settlement.transitioned) {
    scheduleExportFailureEvent(platform, exportJobId, errorCode, durationMs);
    return { kind: "failed", result: { kind: "failed", error: errorMessage, reason: errorCode } };
  }
  return { kind: "settled", result: await resolveRecoverySettlement(userId, exportJobId, platform) };
}

async function resolveRecoverySettlement(userId: string, exportJobId: string, platform: AsyncExportPlatform): Promise<AsyncExportStatusResult> {
  const latestRow = await readExportJob(userId, exportJobId, platform);
  if (!latestRow) return { kind: "not_found" };
  if (latestRow.status === "pending") return { kind: "pending", stage: latestRow.stage };
  return resolveSettledExportStatus(latestRow, platform, exportJobId);
}

async function resolveCancellation(userId: string, exportJobId: string, platform: AsyncExportPlatform, row: ExportJobRow) {
  const settlement = await cancelExportJob({
    userId,
    exportJobId,
    durationMs: Math.max(0, Date.now() - new Date(row.created_at).getTime()),
  });
  if (settlement.status === "pending") return { kind: "pending", stage: row.stage } as const;
  const latestRow = await readExportJob(userId, exportJobId, platform);
  if (!latestRow) return { kind: "not_found" } as const;
  return resolveSettledExportStatus(latestRow, platform, exportJobId);
}

function scheduleExportFailureEvent(platform: AsyncExportPlatform, exportJobId: string, errorCode: string, durationMs: number) {
  scheduleOpsEvent(createExportFailureEvent({
    platform,
    exportJobId,
    errorCode,
    durationMs,
    watchdog: errorCode === "build_watchdog_timeout",
  }));
}

async function readExportJob(userId: string, exportJobId: string, platform: AsyncExportPlatform) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,user_id,platform,status,stage,file_name,error,error_code,created_at,enqueue_state,enqueue_attempt,builder_operation_name,builder_execution_name,input_completed_at,triggered_at,builder_started_at,last_heartbeat_at,recovery_reason,cancel_requested_at")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  return data as ExportJobRow | null;
}

/**
 * A new export request must give an eligible interrupted job its one recovery
 * attempt before reserve_export_credit examines stale reservations. The RPC
 * separately preserves input-complete/triggered jobs, so this cannot refund a
 * job that has just been recovered.
 */
export async function recoverStalePendingExportBeforeReservation(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("id,platform,created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const row = data as Pick<ExportJobRow, "id" | "platform" | "created_at"> | null;
  if (!row || Date.now() - new Date(row.created_at).getTime() <= enqueueRecoveryStaleMs) return;
  await resolveExportStatus(userId, row.id, row.platform);
}

async function resolveSettledExportStatus(row: ExportJobRow, platform: AsyncExportPlatform, exportJobId: string): Promise<AsyncExportStatusResult> {
  if (row.status === "succeeded") {
    if (!row.file_name) return { kind: "failed", error: "내보내기 결과 파일을 찾지 못했습니다.", reason: "server_error" };
    return { kind: "completed", downloadUrl: await signOutputUrl(platform, exportJobId, row.file_name), fileName: row.file_name };
  }

  const errorCode = row.error_code ?? fallbackBuildFailureReason(platform);
  if (errorCode !== "build_cancelled") {
    scheduleExportFailureEvent(platform, exportJobId, errorCode, Date.now() - new Date(row.created_at).getTime());
  }
  return { kind: "failed", error: row.error ?? "내보내기 작업에 실패했습니다.", reason: errorCode };
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
  return readBuilderConfig({ platform });
}

function getWatchdogStaleMs(platform: AsyncExportPlatform) {
  const envName = platform === "ios" ? "IOS_EXPORT_WATCHDOG_MS" : "ANDROID_EXPORT_WATCHDOG_MS";
  return Number.parseInt(process.env[envName] ?? process.env.EXPORT_WATCHDOG_MS ?? "", 10) || 25 * 60 * 1000;
}

function fallbackBuildFailureReason(platform: AsyncExportPlatform) {
  return platform === "ios" ? "ios_export_failed" : "android_build_failed";
}

function isAlreadySettled(error: unknown) {
  return error instanceof Error && (error.message.includes("export_job_not_pending") || error.message.includes("export_job_cancel_requested"));
}

async function downloadResultJson(config: BuilderConfig, accessToken: string, exportJobId: string): Promise<ResultJson | null> {
  const objectName = `${exportJobId}/result.json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), resultJsonRequestTimeoutMs);
  try {
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.outputBucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("gcs_result_read_failed");
    return (await awaitWithAbort(response.json(), controller.signal)) as ResultJson;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("gcs_result_read_timeout");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      rejectOnce(error);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    operation.then(resolveOnce, rejectOnce);
  });
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
