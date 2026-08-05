import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { denyNonAdmin } from "@/lib/notices/adminApi";
import { validateInquiryMessage, validateInquiryStatus, type InquiryMessageBody } from "@/lib/inquiries/api";
import {
  inquiryMessageSelectColumns,
  inquirySelectColumns,
  mapInquiryMessageRow,
  mapInquiryRow,
} from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: inquiry, error } = await admin.from("inquiries").select(`${inquirySelectColumns},user_id`).eq("id", id).maybeSingle();
  if (error) {
    console.error("관리자 문의 조회 실패", error);
    return NextResponse.json({ error: "문의를 불러오지 못했습니다." }, { status: 500 });
  }
  if (!inquiry) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  const { data: messages } = await admin
    .from("inquiry_messages")
    .select(inquiryMessageSelectColumns)
    .eq("inquiry_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    inquiry: { ...mapInquiryRow(inquiry), messages: (messages ?? []).map(mapInquiryMessageRow) },
    userId: inquiry.user_id,
  });
}

/** 관리자 답변. 상태 전환과 `answered_at` 갱신은 트리거가 한다. */
export async function POST(request: Request, { params }: RouteContext) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as InquiryMessageBody;
  const invalid = validateInquiryMessage(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const adminAuth = await getCurrentAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inquiry_messages")
    .insert({ inquiry_id: id, author: "admin", author_user_id: adminAuth.user?.id ?? null, body: body.body!.trim() })
    .select(inquiryMessageSelectColumns)
    .single();
  if (error) {
    console.error("관리자 답변 저장 실패", error);
    return NextResponse.json({ error: "답변을 저장하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ message: mapInquiryMessageRow(data) }, { status: 201 });
}

/** 상태 변경. 종료는 관리자만 한다. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const invalid = validateInquiryStatus(body.status);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("inquiries").update({ status: body.status }).eq("id", id).select(inquirySelectColumns).maybeSingle();
  if (error) {
    console.error("문의 상태 변경 실패", error);
    return NextResponse.json({ error: "상태를 변경하지 못했습니다." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ inquiry: mapInquiryRow(data) });
}
