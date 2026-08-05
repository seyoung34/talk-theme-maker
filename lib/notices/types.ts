export const noticeCategories = ["update", "maintenance", "policy", "etc"] as const;

export type NoticeCategory = (typeof noticeCategories)[number];

export type Notice = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: NoticeCategory;
  readonly pinned: boolean;
  /** null이면 비공개 초안. 미래 시각이면 예약 발행. */
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const noticeCategoryLabels: Record<NoticeCategory, string> = {
  update: "업데이트",
  maintenance: "점검",
  policy: "정책",
  etc: "안내",
};

export function isNoticeCategory(value: unknown): value is NoticeCategory {
  return typeof value === "string" && (noticeCategories as readonly string[]).includes(value);
}

/**
 * 본문을 문단으로 나눈다.
 *
 * 마크다운 렌더러를 붙이지 않는다. 의존성이 늘고, 관리자가 쓴 HTML을 그대로 그리면 XSS 경로가
 * 생긴다. 빈 줄로 문단을 나누는 것만으로 공지 본문에는 충분하다 — 정책 문서(`PolicyDocumentPage`)도
 * 문단 배열을 그대로 그린다.
 */
export function toNoticeParagraphs(body: string): string[] {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function mapNoticeRow(row: {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}): Notice {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: isNoticeCategory(row.category) ? row.category : "etc",
    pinned: row.pinned,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const noticeSelectColumns = "id,title,body,category,pinned,published_at,created_at,updated_at";
