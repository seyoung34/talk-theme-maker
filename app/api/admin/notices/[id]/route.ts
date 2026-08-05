import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { denyNonAdmin, toNoticeRow, validateNoticeBody, type NoticeWriteBody } from "@/lib/notices/adminApi";
import { mapNoticeRow, noticeSelectColumns } from "@/lib/notices/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as NoticeWriteBody;
  const invalid = validateNoticeBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("notices").update(toNoticeRow(body)).eq("id", id).select(noticeSelectColumns).maybeSingle();
  if (error) {
    console.error("공지 수정 실패", error);
    return NextResponse.json({ error: "공지를 수정하지 못했습니다." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ notice: mapNoticeRow(data) });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("notices").delete().eq("id", id);
  if (error) {
    console.error("공지 삭제 실패", error);
    return NextResponse.json({ error: "공지를 삭제하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
