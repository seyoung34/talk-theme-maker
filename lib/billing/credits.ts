import { createAdminClient, createClient } from "@/lib/supabase/server";

export const exportCreditCost = 1;

export type ExportPlatform = "android" | "ios";
export type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
export type ExportStage = "queued" | "preparing" | "building" | "packaging" | "finalizing" | "completed" | "failed";

type ReservationRow = { export_job_id: string; balance: number };

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
}: {
  userId: string;
  platform: ExportPlatform;
  mode: ExportMode;
  inputFileCount: number;
  inputBytes: number;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_export_credit", {
    p_user_id: userId,
    p_platform: platform,
    p_export_mode: mode,
    p_input_file_count: inputFileCount,
    p_input_bytes: inputBytes,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
  if (!row?.export_job_id) throw new Error("export_reservation_failed");
  return { exportJobId: row.export_job_id, balance: Number(row.balance ?? 0) };
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
