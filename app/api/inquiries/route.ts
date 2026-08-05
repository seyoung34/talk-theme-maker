import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/auth";
import {
  assertOwnedExportJob,
  denyOverRateLimit,
  validateInquiryCreate,
  type InquiryCreateBody,
} from "@/lib/inquiries/api";
import { inquirySelectColumns, mapInquiryRow } from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

/**
 * 본인 문의 목록.
 *
 * 사용자 세션 클라이언트로 읽는다. RLS가 `user_id = auth.uid()`를 강제하므로 여기서 조건을
 * 다시 쓰지 않는다 — 두 곳에 두면 한쪽만 고쳐졌을 때 남의 문의가 샌다.
 */
export async function GET() {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select(inquirySelectColumns)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("문의 목록 조회 실패", error);
    return NextResponse.json({ error: "문의 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ inquiries: (data ?? []).map(mapInquiryRow) });
}

export async function POST(request: Request) {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const body = (await request.json().catch(() => ({}))) as InquiryCreateBody;
  const invalid = validateInquiryCreate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const limited = await denyOverRateLimit(admin, auth.userId);
  if (limited) return limited;

  if (body.exportJobId) {
    const ownershipError = await assertOwnedExportJob(admin, auth.userId, body.exportJobId);
    if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 400 });
  }

  // 접수는 사용자 세션으로 한다. 삭제 진행 중 차단과 소유권 검사를 RLS가 맡는다.
  const supabase = await createClient();
  const { data: inquiry, error } = await supabase
    .from("inquiries")
    .insert({
      user_id: auth.userId,
      category: body.category,
      title: body.title!.trim(),
      export_job_id: body.exportJobId || null,
    })
    .select(inquirySelectColumns)
    .single();
  if (error) {
    // RLS가 막은 경우도 여기로 온다. 계정 삭제가 진행 중인 계정이 대표적이다.
    console.error("문의 접수 실패", error);
    return NextResponse.json({ error: "문의를 접수하지 못했습니다." }, { status: 500 });
  }

  const { error: messageError } = await supabase
    .from("inquiry_messages")
    .insert({ inquiry_id: inquiry.id, author: "user", body: body.body!.trim() });
  if (messageError) {
    // 본문 없는 문의는 의미가 없다. 관리자 화면에 빈 스레드가 남지 않게 되돌린다.
    console.error("문의 본문 저장 실패", messageError);
    await admin.from("inquiries").delete().eq("id", inquiry.id);
    return NextResponse.json({ error: "문의를 접수하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ inquiry: mapInquiryRow(inquiry) }, { status: 201 });
}
