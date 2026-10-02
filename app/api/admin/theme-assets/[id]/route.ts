import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { deleteUnreferencedAdminAsset } from "@/lib/theme/server/deleteAdminAsset";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAdmin();
  if (!auth.configured || !auth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "에셋 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const result = await deleteUnreferencedAdminAsset(id);
    if (result === "linked") return NextResponse.json({ error: "연결된 시스템 템플릿에서 저장 참조를 해제한 뒤 삭제해 주세요." }, { status: 409 });
    if (result === "incomplete") return NextResponse.json({ error: "연결 조회가 완료되지 않아 삭제를 보류했습니다." }, { status: 503 });
    if (result === "missing") return NextResponse.json({ error: "에셋을 찾을 수 없습니다." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Admin asset deletion failed", error);
    return NextResponse.json({ error: "관리 후보를 삭제하지 못했습니다." }, { status: 500 });
  }
}
