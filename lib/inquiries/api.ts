import { NextResponse } from "next/server";
import { inquiryLimits, isInquiryCategory, isInquiryStatus } from "@/lib/inquiries/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InquiryCreateBody = {
  category?: string;
  title?: string;
  body?: string;
  exportJobId?: string | null;
};

export type InquiryMessageBody = { body?: string };

/**
 * 접수 빈도 상한.
 *
 * 알림이 없어 연타할 이유가 없고, 무제한이면 3년 보존 대상 데이터를 무한히 늘릴 수 있다.
 * 별도 인프라를 도입하지 않고 `created_at` 을 세는 것으로 충분하다 — 정확한 슬라이딩 윈도가
 * 필요한 성격이 아니다. 수치는 초안이며 운영 로그를 보고 조정한다.
 */
export const inquiryRateLimits = {
  createPerHour: 10,
  messagePerMinute: 10,
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 통과하면 `null`, 아니면 사용자에게 보여줄 한국어 사유. 길이 값은 DB CHECK 와 같다. */
export function validateInquiryCreate(body: InquiryCreateBody) {
  if (!isInquiryCategory(body.category)) return "문의 분류를 선택해 주세요.";
  if (!body.title || !body.title.trim()) return "제목을 입력해 주세요.";
  if (body.title.trim().length > inquiryLimits.titleMax) return `제목은 ${inquiryLimits.titleMax}자 이하로 입력해 주세요.`;
  const messageError = validateInquiryMessage(body);
  if (messageError) return messageError;
  if (body.exportJobId && !uuidPattern.test(body.exportJobId)) return "내보내기 작업 번호 형식이 올바르지 않습니다.";
  return null;
}

export function validateInquiryMessage(body: InquiryMessageBody) {
  if (!body.body || !body.body.trim()) return "내용을 입력해 주세요.";
  if (body.body.trim().length > inquiryLimits.bodyMax) return `내용은 ${inquiryLimits.bodyMax}자 이하로 입력해 주세요.`;
  return null;
}

export function validateInquiryStatus(value: unknown) {
  return isInquiryStatus(value) ? null : "문의 상태 값이 올바르지 않습니다.";
}

/**
 * 적어 낸 내보내기 작업이 본인 것인지 확인한다.
 *
 * `export_job_id` 에는 FK 가 없다(내보내기 기록이 정리돼도 문의는 남아야 한다). 그래서 값이
 * 무엇이든 저장되며, 확인하지 않으면 사용자가 남의 작업 번호를 적어 관리자 화면이 그 값으로
 * 다른 사람의 내보내기를 열어보게 만들 수 있다.
 */
export async function assertOwnedExportJob(admin: SupabaseClient, userId: string, exportJobId: string) {
  const { data, error } = await admin.from("export_jobs").select("id").eq("id", exportJobId).eq("user_id", userId).maybeSingle();
  if (error) return "내보내기 작업을 확인하지 못했습니다.";
  if (!data) return "본인의 내보내기 작업 번호가 아닙니다.";
  return null;
}

export async function denyOverRateLimit(admin: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) return null;
  if ((count ?? 0) >= inquiryRateLimits.createPerHour) {
    return NextResponse.json({ error: "문의를 너무 자주 접수했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  return null;
}

export async function denyOverMessageRateLimit(admin: SupabaseClient, inquiryId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin
    .from("inquiry_messages")
    .select("id", { count: "exact", head: true })
    .eq("inquiry_id", inquiryId)
    .eq("author", "user")
    .gte("created_at", since);
  if (error) return null;
  if ((count ?? 0) >= inquiryRateLimits.messagePerMinute) {
    return NextResponse.json({ error: "메시지를 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  return null;
}
