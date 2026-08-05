import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/auth";
import { denyOverMessageRateLimit, validateInquiryMessage, type InquiryMessageBody } from "@/lib/inquiries/api";
import { inquiryMessageSelectColumns, mapInquiryMessageRow } from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 사용자 답신.
 *
 * 소유권·종료 여부·삭제 진행 중 차단은 전부 `inquiry_messages`의 INSERT 정책이 판정한다.
 * 상태 전환(`answered` → `open`)과 `updated_at` 갱신은 `apply_inquiry_message()` 트리거가 한다.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as InquiryMessageBody;
  const invalid = validateInquiryMessage(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const limited = await denyOverMessageRateLimit(createAdminClient(), id);
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiry_messages")
    .insert({ inquiry_id: id, author: "user", body: body.body!.trim() })
    .select(inquiryMessageSelectColumns)
    .single();
  if (error) {
    // 종료된 문의이거나 본인 문의가 아니거나 계정 삭제가 진행 중이면 RLS가 여기서 막는다.
    console.error("문의 메시지 저장 실패", error);
    return NextResponse.json({ error: "메시지를 보내지 못했습니다. 종료된 문의에는 답신할 수 없습니다." }, { status: 400 });
  }
  return NextResponse.json({ message: mapInquiryMessageRow(data) }, { status: 201 });
}
