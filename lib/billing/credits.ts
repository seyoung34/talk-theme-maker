import { createAdminClient, createClient } from "@/lib/supabase/server";

export const exportCreditCost = 1;

export type ExportPlatform = "android" | "ios";
export type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
export type ExportStage = "queued" | "preparing" | "building" | "packaging" | "finalizing" | "completed" | "failed";
export type ExportBackend = "worker" | "cloud_run";

type ReservationRow = { export_job_id: string; balance: number };
type ExportIdentityRow = { export_number: number; application_id: string | null; theme_identifier: string | null; export_name: string | null };

export async function getCurrentUserOrNull() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function getCreditBalance(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

export async function reserveCreditForExport({
  userId,
  platform,
  mode,
  inputFileCount,
  inputBytes,
  referencedAssetBytes = 0,
  referencedAssetFileCount = 0,
}: {
  userId: string;
  platform: ExportPlatform;
  mode: ExportMode;
  /** Worker가 실제로 읽은 업로드 파일 수. catalog 참조는 여기에 포함하지 않는다. */
  inputFileCount: number;
  /** Worker가 실제로 읽은 업로드 바이트. 50MiB 상한은 이 값에만 걸린다. */
  inputBytes: number;
  /**
   * GCS catalog 참조 바이트. 출력 경로마다 합산한다 — 같은 object를 여러 경로가 쓰면 결과물이
   * 그만큼 커지기 때문이다. Worker를 통과하지 않으므로 `inputBytes`와 더해서 보지 않는다.
   * DB가 `logical_input_bytes = input_bytes + referenced_asset_bytes`를 계산한다.
   */
  referencedAssetBytes?: number;
  referencedAssetFileCount?: number;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_export_credit", {
    p_user_id: userId,
    p_platform: platform,
    p_export_mode: mode,
    p_input_file_count: inputFileCount,
    p_input_bytes: inputBytes,
    p_referenced_asset_bytes: referencedAssetBytes,
    p_referenced_asset_file_count: referencedAssetFileCount,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
  if (!row?.export_job_id) throw new Error("export_reservation_failed");
  return { exportJobId: row.export_job_id, balance: Number(row.balance ?? 0) };
}

export async function prepareExportJobIdentity({
  userId,
  exportJobId,
  exportName,
}: {
  userId: string;
  exportJobId: string;
  exportName: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .update({ export_name: exportName.slice(0, 120) })
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .select("export_number,application_id,theme_identifier,export_name")
    .single();
  if (error) throw error;
  const row = data as ExportIdentityRow;
  return {
    exportNumber: Number(row.export_number),
    applicationId: row.application_id,
    themeIdentifier: row.theme_identifier,
    exportName: row.export_name,
  };
}

export async function markExportJobBackend({
  userId,
  exportJobId,
  backend,
}: {
  userId: string;
  exportJobId: string;
  backend: ExportBackend;
}) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("export_jobs")
    .update({ export_backend: backend } as never)
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function updateExportJobStage({
  userId,
  exportJobId,
  stage,
}: {
  userId: string;
  exportJobId: string;
  stage: Exclude<ExportStage, "completed" | "failed">;
}) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("export_jobs")
    .update({ stage })
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function completeExportJob({
  userId,
  exportJobId,
  fileName,
  outputBytes,
  durationMs,
}: {
  userId: string;
  exportJobId: string;
  fileName: string;
  outputBytes: number;
  durationMs: number;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_export_job", {
    p_user_id: userId,
    p_export_job_id: exportJobId,
    p_file_name: fileName,
    p_output_bytes: outputBytes,
    p_duration_ms: durationMs,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function failExportJob({
  userId,
  exportJobId,
  errorCode,
  errorMessage,
  durationMs,
}: {
  userId: string;
  exportJobId: string;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fail_export_job", {
    p_user_id: userId,
    p_export_job_id: exportJobId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_duration_ms: durationMs,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export function isInsufficientCreditsError(error: unknown) {
  return hasErrorMessage(error, "insufficient_credits");
}

export function isExportAlreadyInProgressError(error: unknown) {
  return hasErrorMessage(error, "export_already_in_progress") || hasErrorCode(error, "23505");
}

function hasErrorMessage(error: unknown, value: string) {
  if (error instanceof Error) return error.message.includes(value);
  return typeof error === "object" && error !== null && "message" in error && String(error.message).includes(value);
}

function hasErrorCode(error: unknown, value: string) {
  return typeof error === "object" && error !== null && "code" in error && String(error.code) === value;
}
