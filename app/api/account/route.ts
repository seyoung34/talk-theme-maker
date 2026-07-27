import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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

  const admin = createAdminClient();
  const { data: adminProfile, error: adminLookupError } = await admin
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminLookupError) {
    console.error("Failed to check account deletion eligibility", adminLookupError);
    return NextResponse.json({ error: "회원탈퇴 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (adminProfile) return NextResponse.json({ error: "관리자 계정은 이 화면에서 탈퇴할 수 없습니다." }, { status: 403 });

  const { data: pendingExport, error: pendingExportError } = await admin
    .from("export_jobs")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (pendingExportError) {
    console.error("Failed to check pending exports before account deletion", pendingExportError);
    return NextResponse.json({ error: "진행 중인 내보내기 작업을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (pendingExport) return NextResponse.json({ error: "진행 중인 내보내기가 끝난 뒤 회원탈퇴를 진행해 주세요." }, { status: 409 });

  // auth.users를 하드 삭제한다. 사용자 소유 테이블은 외래 키의 on delete cascade로 함께 정리된다.
  // service-role 키는 서버에서만 사용하는 createAdminClient에 한정한다.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Failed to delete account", deleteError);
    return NextResponse.json({ error: "회원탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
