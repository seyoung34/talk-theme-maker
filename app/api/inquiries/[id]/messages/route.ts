import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/auth";
import { inquiryRpcErrorResponse, validateInquiryMessage, type InquiryMessageBody } from "@/lib/inquiries/api";
import { inquiryMessageSelectColumns, mapInquiryMessageRow } from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 사용자 답신.
 *
 * 소유권·종료 여부·삭제 진행 중 차단·빈도 제한을 `add_inquiry_message` RPC 가 락 안에서
 * 확인한다. 상태 전환(`answered` → `open`)과 `updated_at` 갱신은 트리거가 한다.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as InquiryMessageBody;
  const invalid = validateInquiryMessage(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = await createClient();
  const { data: messageId, error } = await supabase.rpc("add_inquiry_message", {
    p_inquiry_id: id,
    p_body: body.body!.trim(),
  });
  if (error) return inquiryRpcErrorResponse(error, "메시지를 보내지 못했습니다.");

  const { data } = await supabase.from("inquiry_messages").select(inquiryMessageSelectColumns).eq("id", messageId).maybeSingle();
  return NextResponse.json({ message: data ? mapInquiryMessageRow(data) : { id: messageId } }, { status: 201 });
}
