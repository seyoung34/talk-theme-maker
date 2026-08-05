import { NextResponse } from "next/server";
import { inquiryLimits, isInquiryCategory, isInquiryStatus } from "@/lib/inquiries/types";

export type InquiryCreateBody = {
  category?: string;
  title?: string;
  body?: string;
  exportJobId?: string | null;
};

export type InquiryMessageBody = { body?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 형식 검증. 통과하면 `null`, 아니면 사용자에게 보여줄 한국어 사유. 길이 값은 DB CHECK 와 같다.
 *
 * 소유권·빈도 같은 **상태에 의존하는 검증은 여기서 하지 않는다.** 그것들은 `create_inquiry`
 * RPC 안에서 락을 잡은 채 확인한다. 서버 코드에만 두면 PostgREST 를 직접 호출해 우회할 수 있고,
 * 확인과 쓰기 사이에 상태가 바뀔 수도 있다.
 */
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
 * RPC 가 올린 예외를 사용자 응답으로 옮긴다.
 *
 * RPC 는 안정적인 키워드만 던지고 문구는 여기서 정한다. DB 메시지를 그대로 내보내면 스키마
 * 사정이 사용자에게 새고, 문구를 고칠 때마다 마이그레이션이 필요해진다.
 */
const inquiryRpcErrors: Record<string, { status: number; message: string }> = {
  unauthenticated: { status: 401, message: "로그인이 필요합니다." },
  deletion_pending: { status: 409, message: "회원탈퇴가 진행 중인 계정에서는 문의를 접수할 수 없습니다." },
  rate_limited: { status: 429, message: "문의를 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요." },
  export_job_not_owned: { status: 400, message: "본인의 내보내기 작업 번호가 아닙니다." },
  inquiry_not_found: { status: 404, message: "문의를 찾을 수 없습니다." },
  inquiry_closed: { status: 400, message: "종료된 문의에는 답신할 수 없습니다. 새 문의를 접수해 주세요." },
};

export function inquiryRpcErrorResponse(error: { message?: string } | null, fallback: string) {
  const known = Object.entries(inquiryRpcErrors).find(([key]) => error?.message?.includes(key));
  if (known) return NextResponse.json({ error: known[1].message }, { status: known[1].status });
  console.error("문의 RPC 실패", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
