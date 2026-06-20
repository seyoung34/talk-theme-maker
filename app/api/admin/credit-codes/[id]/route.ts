import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
type UpdateBody = { status?: "active" | "inactive" };

export async function PATCH(request: Request, context: RouteContext) {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (body.status !== "active" && body.status !== "inactive") return NextResponse.json({ error: "변경할 상태가 올바르지 않습니다." }, { status: 400 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("credit_grant_codes").update({ status: body.status }).eq("id", id).select("id,status,updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: "코드 상태를 변경하지 못했습니다." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "지급 코드를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ item: data });
}
