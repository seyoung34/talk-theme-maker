import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { denyNonAdmin, toNoticeRow, validateNoticeBody, type NoticeWriteBody } from "@/lib/notices/adminApi";
import { mapNoticeRow, noticeSelectColumns } from "@/lib/notices/types";

export const dynamic = "force-dynamic";

/** 관리자 목록은 초안과 예약 발행분까지 본다. 그래서 RLS를 우회하는 admin 클라이언트를 쓴다. */
export async function GET() {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notices")
    .select(noticeSelectColumns)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("공지 목록 조회 실패", error);
    return NextResponse.json({ error: "공지 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ notices: (data ?? []).map(mapNoticeRow) });
}

export async function POST(request: Request) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as NoticeWriteBody;
  const invalid = validateNoticeBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const adminAuth = await getCurrentAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notices")
    .insert({ ...toNoticeRow(body), created_by: adminAuth.user?.id ?? null })
    .select(noticeSelectColumns)
    .single();
  if (error) {
    console.error("공지 생성 실패", error);
    return NextResponse.json({ error: "공지를 저장하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ notice: mapNoticeRow(data) }, { status: 201 });
}
