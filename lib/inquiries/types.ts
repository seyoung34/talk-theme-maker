export const inquiryCategories = ["payment", "export", "account", "privacy", "etc"] as const;
export const inquiryStatuses = ["open", "answered", "closed"] as const;

export type InquiryCategory = (typeof inquiryCategories)[number];
export type InquiryStatus = (typeof inquiryStatuses)[number];

export type InquiryMessage = {
  readonly id: string;
  readonly author: "user" | "admin";
  readonly body: string;
  readonly createdAt: string;
};

export type Inquiry = {
  readonly id: string;
  readonly category: InquiryCategory;
  readonly title: string;
  readonly status: InquiryStatus;
  readonly exportJobId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 마지막 관리자 답변 시각. 첫 답변이 아니다. */
  readonly answeredAt: string | null;
  readonly userReadAt: string | null;
  readonly messages?: readonly InquiryMessage[];
};

export const inquiryCategoryLabels: Record<InquiryCategory, string> = {
  payment: "결제·환불",
  export: "내보내기 오류",
  account: "계정",
  privacy: "개인정보",
  etc: "기타",
};

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  open: "답변 대기",
  answered: "답변 완료",
  closed: "종료",
};

export const inquiryLimits = {
  titleMax: 200,
  /** 공지 본문(20000)보다 짧다. 한 번에 다 쓰지 않고 스레드로 이어가는 형태다. */
  bodyMax: 5000,
} as const;

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return typeof value === "string" && (inquiryCategories as readonly string[]).includes(value);
}

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && (inquiryStatuses as readonly string[]).includes(value);
}

/** 종료된 문의에는 글이 붙지 않는다. 붙으면 관리자 목록에서 사라진 채 대화가 이어진다. */
export function canReplyToInquiry(status: InquiryStatus) {
  return status !== "closed";
}

/**
 * 답변을 아직 읽지 않았는가.
 *
 * 알림을 보내지 않기로 했으므로(2-D) 사용자는 직접 들어와 확인한다. 목록에서 표시를 주려면
 * 이 판정이 필요하다. 배지 UI 자체는 Phase 4지만 규칙은 여기 한 곳에 둔다.
 */
export function hasUnreadAnswer(inquiry: Pick<Inquiry, "answeredAt" | "userReadAt">) {
  if (!inquiry.answeredAt) return false;
  if (!inquiry.userReadAt) return true;
  return new Date(inquiry.answeredAt).getTime() > new Date(inquiry.userReadAt).getTime();
}

export const inquirySelectColumns = "id,category,title,status,export_job_id,created_at,updated_at,answered_at,user_read_at";
export const inquiryMessageSelectColumns = "id,author,body,created_at";

export function mapInquiryRow(row: {
  id: string;
  category: string;
  title: string;
  status: string;
  export_job_id: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  user_read_at: string | null;
}): Inquiry {
  return {
    id: row.id,
    category: isInquiryCategory(row.category) ? row.category : "etc",
    title: row.title,
    status: isInquiryStatus(row.status) ? row.status : "open",
    exportJobId: row.export_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answeredAt: row.answered_at,
    userReadAt: row.user_read_at,
  };
}

export function mapInquiryMessageRow(row: { id: string; author: string; body: string; created_at: string }): InquiryMessage {
  return {
    id: row.id,
    author: row.author === "admin" ? "admin" : "user",
    body: row.body,
    createdAt: row.created_at,
  };
}
