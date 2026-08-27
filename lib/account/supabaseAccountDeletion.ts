import { createAdminClient } from "@/lib/supabase/server";
import { deleteAccount, type AccountDeletionRepository, type AccountDeletionResult } from "@/lib/account/deleteAccount";

export async function deleteSupabaseAccount(userId: string): Promise<AccountDeletionResult> {
  const admin = createAdminClient();

  const repository: AccountDeletionRepository = {
    async isAdmin(candidateUserId) {
      const { data, error } = await admin
        .from("admin_profiles")
        .select("user_id")
        .eq("user_id", candidateUserId)
        .maybeSingle();
      return { value: Boolean(data), error };
    },
    async hasPendingExport(candidateUserId) {
      const { data, error } = await admin
        .from("export_jobs")
        .select("id")
        .eq("user_id", candidateUserId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      return { value: Boolean(data), error };
    },
    async hasPendingPayment(candidateUserId) {
      const { data, error } = await admin
        .from("payments")
        .select("id")
        .eq("user_id", candidateUserId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      return { value: Boolean(data), error };
    },
    async hasBillingHold(candidateUserId) {
      const { data, error } = await admin
        .from("credit_balances")
        .select("user_id")
        .eq("user_id", candidateUserId)
        .eq("billing_hold", true)
        .maybeSingle();
      return { value: Boolean(data), error };
    },
    async prepareServiceDataDeletion(candidateUserId) {
      const { error } = await admin.rpc("prepare_account_deletion", {
        p_user_id: candidateUserId,
      });
      return { error };
    },
    async deleteAuthUser(candidateUserId) {
      const { error } = await admin.auth.admin.deleteUser(candidateUserId);
      return { error };
    },
    async completeDeletionAudit(candidateUserId) {
      const { error } = await admin.rpc("complete_account_deletion", {
        p_user_id: candidateUserId,
      });
      return { error };
    },
  };

  return deleteAccount(userId, repository);
}
