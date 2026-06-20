import { createAdminClient, createClient } from "@/lib/supabase/server";

export const exportCreditCost = 1;
export const creditPack = {
  credits: 10,
  amount: 9900,
  name: "10 Credits",
};

export type ExportPlatform = "android" | "ios";

export type ExportMode = "project" | "apk" | "apk-zip" | "theme-zip" | "ktheme";

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

export async function createPendingExportJob({
  userId,
  platform,
  mode,
}: {
  userId: string;
  platform: ExportPlatform;
  mode: ExportMode;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("export_jobs")
    .insert({
      user_id: userId,
      platform,
      export_mode: mode,
      status: "pending",
      credit_cost: exportCreditCost,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function markExportFailed(exportJobId: string, errorMessage: string) {
  const admin = createAdminClient();
  await admin.from("export_jobs").update({ status: "failed", error: errorMessage.slice(0, 500) }).eq("id", exportJobId);
}

export async function spendCreditForExport({
  userId,
  exportJobId,
  fileName,
  reason,
}: {
  userId: string;
  exportJobId: string;
  fileName: string;
  reason: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("export_jobs").update({ file_name: fileName }).eq("id", exportJobId).eq("user_id", userId);
  if (error) throw error;

  const { data, error: rpcError } = await admin.rpc("spend_export_credit", {
    p_user_id: userId,
    p_export_job_id: exportJobId,
    p_amount: exportCreditCost,
    p_reason: reason,
  });
  if (rpcError) throw rpcError;
  return Number(data ?? 0);
}

export function isInsufficientCreditsError(error: unknown) {
  return error instanceof Error && error.message.includes("insufficient_credits");
}
