import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const exportCreditCost = 1;
export const signupBonusCampaignKey = "signup_bonus_v1";
export type SignupBonusCampaignStatus = "active" | "inactive";

export type SignupBonusClaimResult = {
  campaignKey: string;
  creditsGranted: number;
  balance: number;
  alreadyClaimed: boolean;
};

export type ExportPlatform = "android" | "ios";
export type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";
export type ExportStage = "queued" | "preparing" | "building" | "packaging" | "finalizing" | "completed" | "failed";
export type ExportBackend = "worker" | "cloud_run";
export type ExportJobStatus = "pending" | "succeeded" | "failed";

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

/**
 * 인증을 마친 신규 계정의 가입 혜택을 한 번만 claim한다.
 *
 * 이 함수는 세션 클라이언트로 RPC를 호출해야 `auth.uid()`가 현재 사용자로 해석된다.
 * 잔액 증가와 claim/ledger 기록은 DB 함수 하나의 트랜잭션 안에서 처리한다.
 */
export async function claimSignupBonusForCurrentUser(): Promise<SignupBonusClaimResult> {
  const supabase = await createClient();
  return claimSignupBonusWithClient(supabase);
}

/**
 * 이미 인증 세션을 교환한 callback에서 같은 클라이언트로 claim한다.
 * 새 클라이언트를 만들면 callback 요청 안에서 갱신된 세션 쿠키를 다시 읽지 못할 수 있다.
 */
export async function claimSignupBonusWithClient(supabase: SupabaseClient): Promise<SignupBonusClaimResult> {
  const { data, error } = await supabase.rpc("claim_signup_bonus", { p_campaign_key: signupBonusCampaignKey });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    campaign_key?: string;
    credits_granted?: number;
    balance?: number;
    already_claimed?: boolean;
  } | null;

  if (!row?.campaign_key) throw new Error("signup_bonus_claim_failed");
  return {
    campaignKey: row.campaign_key,
    creditsGranted: Number(row.credits_granted ?? 0),
    balance: Number(row.balance ?? 0),
    alreadyClaimed: Boolean(row.already_claimed),
  };
}

export function isSignupBonusUnavailableError(error: unknown) {
  return [
    "invalid_signup_bonus_campaign",
    "promotion_not_found",
    "promotion_inactive",
    "promotion_not_started",
    "promotion_expired",
    "signup_bonus_not_eligible",
    "signup_bonus_verification_required",
    "promotion_limit_reached",
  ].some((value) => hasErrorMessage(error, value));
}

export function isBillingHoldError(error: unknown) {
  return hasErrorMessage(error, "billing_hold");
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

export async function failExportJobIfPending({
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
  const { data, error } = await admin.rpc("fail_export_job_if_pending", {
    p_user_id: userId,
    p_export_job_id: exportJobId,
    p_error_code: errorCode,
    p_error_message: errorMessage,
    p_duration_ms: durationMs,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    transitioned?: unknown;
    status?: unknown;
    balance?: unknown;
  } | null;
  if (!row || typeof row.transitioned !== "boolean" || !isExportJobStatus(row.status)) {
    throw new Error("export_job_settlement_result_invalid");
  }
  return {
    transitioned: row.transitioned,
    status: row.status,
    balance: Number(row.balance ?? 0),
  };
}

export async function getExportJobStatus({ userId, exportJobId }: { userId: string; exportJobId: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .select("status")
    .eq("id", exportJobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const status = (data as { status?: unknown }).status;
  if (!isExportJobStatus(status)) throw new Error("export_job_status_invalid");
  return status;
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

function isExportJobStatus(value: unknown): value is ExportJobStatus {
  return value === "pending" || value === "succeeded" || value === "failed";
}
