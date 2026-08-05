import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { denyNonAdmin } from "@/lib/notices/adminApi";
import { inquirySelectColumns, isInquiryStatus, mapInquiryRow } from "@/lib/inquiries/types";

export const dynamic = "force-dynamic";

/** 관리자 목록. 상태로 거를 수 있게 한다 — 대기 중인 건을 먼저 보는 것이 기본 동선이다. */
export async function GET(request: Request) {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const status = new URL(request.url).searchParams.get("status");
  const admin = createAdminClient();
  let query = admin.from("inquiries").select(inquirySelectColumns).order("updated_at", { ascending: false });
  if (isInquiryStatus(status)) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("관리자 문의 목록 조회 실패", error);
    return NextResponse.json({ error: "문의 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ inquiries: (data ?? []).map(mapInquiryRow) });
}
