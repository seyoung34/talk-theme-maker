import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/auth";
import {
  inquiryMessageSelectColumns,
  inquirySelectColumns,
  mapInquiryMessageRow,
  mapInquiryRow,
} from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 문의 상세와 스레드.
 *
 * 조회에 성공했다는 것은 RLS가 본인(또는 관리자)임을 확인했다는 뜻이므로, 그 뒤에
 * `user_read_at`을 갱신한다. 이 갱신만 `service_role`을 쓴다 — 사용자에게 `inquiries`
 * UPDATE 권한을 주면 열람 시각뿐 아니라 상태·소유자까지 함께 열린다.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await getRequestUser();
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const supabase = await createClient();
  const { data: inquiry, error } = await supabase.from("inquiries").select(inquirySelectColumns).eq("id", id).maybeSingle();
  if (error) {
    console.error("문의 조회 실패", error);
    return NextResponse.json({ error: "문의를 불러오지 못했습니다." }, { status: 500 });
  }
  if (!inquiry) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  const { data: messages, error: messageError } = await supabase
    .from("inquiry_messages")
    .select(inquiryMessageSelectColumns)
    .eq("inquiry_id", id)
    .order("created_at", { ascending: true });
  if (messageError) {
    console.error("문의 메시지 조회 실패", messageError);
    return NextResponse.json({ error: "문의를 불러오지 못했습니다." }, { status: 500 });
  }

  // 관리자가 열어본 것으로 사용자의 읽음 시각이 바뀌면 안 된다.
  const admin = createAdminClient();
  const { data: owner } = await admin.from("inquiries").select("user_id").eq("id", id).maybeSingle();
  if (owner?.user_id === auth.userId) {
    await admin.from("inquiries").update({ user_read_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({
    inquiry: { ...mapInquiryRow(inquiry), messages: (messages ?? []).map(mapInquiryMessageRow) },
  });
}
