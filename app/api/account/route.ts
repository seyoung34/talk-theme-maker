import { NextResponse } from "next/server";
import { deleteSupabaseAccount } from "@/lib/account/supabaseAccountDeletion";
import { createClient } from "@/lib/supabase/server";

const deletionConfirmation = "탈퇴";

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { confirmation?: unknown }).confirmation !== deletionConfirmation) {
    return NextResponse.json({ error: `회원탈퇴를 진행하려면 '${deletionConfirmation}'를 정확히 입력해 주세요.` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return NextResponse.json({ error: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요." }, { status: 401 });

  const result = await deleteSupabaseAccount(user.id);
  if (result.status === "deleted") {
    if (result.auditCompletionPending) console.error("Account deleted but audit completion is pending", { userId: user.id });
    return NextResponse.json({ deleted: true });
  }

  if (result.status === "blocked") {
    if (result.reason === "admin_account") {
      return NextResponse.json({ error: "관리자 계정은 이 화면에서 탈퇴할 수 없습니다." }, { status: 403 });
    }
    if (result.reason === "pending_export") {
      return NextResponse.json({ error: "진행 중인 내보내기가 끝난 뒤 회원탈퇴를 진행해 주세요." }, { status: 409 });
    }
    if (result.reason === "billing_hold") {
      return NextResponse.json({ error: "환불 조정이 끝난 뒤 회원탈퇴를 진행해 주세요. 고객지원에서 확인할 수 있습니다." }, { status: 409 });
    }
    return NextResponse.json({ error: "진행 중인 결제가 끝난 뒤 회원탈퇴를 진행해 주세요." }, { status: 409 });
  }

  console.error(`Failed account deletion step: ${result.step}`, result.cause);
  const error =
    result.step === "pending_export_lookup"
      ? "진행 중인 내보내기 작업을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
      : result.step === "pending_payment_lookup"
        ? "진행 중인 결제를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : result.step === "billing_hold_lookup"
          ? "환불 조정 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : result.step === "admin_lookup"
          ? "회원탈퇴 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
          : "회원탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return NextResponse.json({ error }, { status: 500 });
}
