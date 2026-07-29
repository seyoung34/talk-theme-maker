export type AccountDeletionBlockReason = "admin_account" | "pending_export" | "pending_payment";
export type AccountDeletionFailureStep =
  | "admin_lookup"
  | "pending_export_lookup"
  | "pending_payment_lookup"
  | "service_data_deletion"
  | "auth_user_delete"
  | "audit_completion";

export type AccountDeletionResult =
  | { status: "deleted"; auditCompletionPending?: boolean }
  | { status: "blocked"; reason: AccountDeletionBlockReason }
  | { status: "failed"; step: AccountDeletionFailureStep; cause: unknown };

export interface AccountDeletionRepository {
  isAdmin(userId: string): Promise<{ value: boolean; error: unknown | null }>;
  hasPendingExport(userId: string): Promise<{ value: boolean; error: unknown | null }>;
  hasPendingPayment(userId: string): Promise<{ value: boolean; error: unknown | null }>;
  prepareServiceDataDeletion(userId: string): Promise<{ error: unknown | null }>;
  deleteAuthUser(userId: string): Promise<{ error: unknown | null }>;
  completeDeletionAudit(userId: string): Promise<{ error: unknown | null }>;
}

/**
 * 계정 삭제 전제 조건과 실행 순서를 한곳에 둔다.
 *
 * 법정 보존 레코드 준비와 일반 서비스 데이터 삭제가 성공한 뒤에만 Auth 사용자를 삭제한다.
 * 남은 크레딧은 종류와 관계없이 탈퇴 시 소멸하며 자동 탈퇴를 차단하지 않는다.
 */
export async function deleteAccount(
  userId: string,
  repository: AccountDeletionRepository,
): Promise<AccountDeletionResult> {
  const admin = await repository.isAdmin(userId);
  if (admin.error) return { status: "failed", step: "admin_lookup", cause: admin.error };
  if (admin.value) return { status: "blocked", reason: "admin_account" };

  const pendingExport = await repository.hasPendingExport(userId);
  if (pendingExport.error) return { status: "failed", step: "pending_export_lookup", cause: pendingExport.error };
  if (pendingExport.value) return { status: "blocked", reason: "pending_export" };

  const pendingPayment = await repository.hasPendingPayment(userId);
  if (pendingPayment.error) return { status: "failed", step: "pending_payment_lookup", cause: pendingPayment.error };
  if (pendingPayment.value) return { status: "blocked", reason: "pending_payment" };

  const preparation = await repository.prepareServiceDataDeletion(userId);
  if (preparation.error) return { status: "failed", step: "service_data_deletion", cause: preparation.error };

  const deletion = await repository.deleteAuthUser(userId);
  if (deletion.error) return { status: "failed", step: "auth_user_delete", cause: deletion.error };

  const auditCompletion = await repository.completeDeletionAudit(userId);
  return auditCompletion.error
    ? { status: "deleted", auditCompletionPending: true }
    : { status: "deleted" };
}
