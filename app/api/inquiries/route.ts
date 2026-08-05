import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/auth";
import { inquiryRpcErrorResponse, validateInquiryCreate, type InquiryCreateBody } from "@/lib/inquiries/api";
import { inquirySelectColumns, mapInquiryRow } from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

/**
 * 본인 문의 목록.
 *
 * 사용자 세션 클라이언트로 읽는다. RLS가 `user_id = auth.uid()`를 강제하므로 여기서 조건을
 * 다시 쓰지 않는다 — 관리자에게 더 넓은 정책이 걸린 `notices`와 달리, 이 테이블의 사용자
 * 조회 정책은 본인 것만 돌려준다.
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

/**
 * 접수.
 *
 * 문의와 첫 메시지를 `create_inquiry` RPC 한 번으로 만든다. 나눠 쓰면 그 사이에 계정 삭제가
 * 끼어 본문 없는 문의만 보존본에 남을 수 있다. 빈도 제한과 내보내기 소유권 확인도 그 안에서
 * 락을 잡은 채 이뤄진다 — 서버 코드에만 두면 PostgREST 직접 호출로 우회된다.
 */
export async function POST(request: Request) {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const body = (await request.json().catch(() => ({}))) as InquiryCreateBody;
  const invalid = validateInquiryCreate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = await createClient();
  const { data: inquiryId, error } = await supabase.rpc("create_inquiry", {
    p_category: body.category,
    p_title: body.title!.trim(),
    p_body: body.body!.trim(),
    p_export_job_id: body.exportJobId || null,
  });
  if (error) return inquiryRpcErrorResponse(error, "문의를 접수하지 못했습니다.");

  const { data, error: readError } = await supabase.from("inquiries").select(inquirySelectColumns).eq("id", inquiryId).maybeSingle();
  if (readError || !data) {
    console.error("접수한 문의를 다시 읽지 못했습니다.", readError);
    // 접수 자체는 끝났다. 목록을 다시 불러오면 보이므로 id 만 돌려준다.
    return NextResponse.json({ inquiry: { id: inquiryId } }, { status: 201 });
  }
  return NextResponse.json({ inquiry: mapInquiryRow(data) }, { status: 201 });
}
