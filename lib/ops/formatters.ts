import { getSiteUrl } from "@/lib/supabase/config";
import type { OpsEvent, OpsDetailValue } from "@/lib/ops/events";
import type { OpsDailySummary } from "@/lib/ops/dailySummary";
import type { OpsIssue, OpsInquiryIssue, OpsStatusSnapshot } from "@/lib/ops/repository";

const severityIcon: Record<OpsEvent["severity"], string> = {
  P1: "🚨",
  P2: "⚠️",
  P3: "ℹ️",
};

const detailLabels: Record<string, string> = {
  platform: "플랫폼",
  errorCode: "오류 코드",
  durationMs: "소요 시간(ms)",
  elapsedMs: "경과 시간(ms)",
  attemptCount: "시도 횟수",
  providerEventType: "Provider 이벤트",
  providerEventId: "Provider 이벤트 ID",
  failureCount: "실패 횟수",
  windowMinutes: "집계 구간(분)",
  dependency: "의존성",
  result: "처리 결과",
  status: "상태",
  summaryDay: "기준일",
  visitorStatus: "방문자 집계",
  visitorCount: "방문자 수",
  sessionCount: "세션 수",
  newUserCount: "신규 방문자",
  signupCount: "가입",
  paymentsPaid: "결제 완료",
  paymentsPaidAmount: "결제 금액",
  paymentFailures: "결제 실패/취소",
  refundsCount: "환불",
  refundsAmount: "환불 금액",
  refundsReviewRequired: "환불 검토",
  exportsSucceeded: "Export 성공",
  exportsFailed: "Export 실패",
  exportsPending: "Export 대기",
  inquiriesNew: "신규 문의",
  inquiriesOpen: "미종결 문의",
  p1Issues: "P1 이슈",
  p2Issues: "P2 이슈",
  deadLetterNotifications: "Dead-letter 알림",
};

export function formatOpsEventForTelegram(event: OpsEvent, options: { siteUrl?: string } = {}) {
  if (event.type === "ops.daily_summary") return formatDailySummaryEvent(event, options);

  const lines = [
    `${severityIcon[event.severity]} [${event.severity}] ${event.summary}`,
    "",
    `이벤트: ${event.type}`,
    `발생 시각: ${formatKoreanTime(event.occurredAt)}`,
  ];

  if (event.entity) lines.push(`${event.entity.kind}: ${event.entity.id}`);

  for (const [key, value] of Object.entries(event.details)) {
    if (!(key in detailLabels)) continue;
    lines.push(`${detailLabels[key] ?? key}: ${formatValue(value)}`);
  }

  const adminUrl = buildAdminUrl(event.adminPath, options.siteUrl ?? getSiteUrl());
  if (adminUrl) {
    lines.push("", `관리자 확인: ${adminUrl}`);
  }

  return lines.join("\n");
}

export function formatOpsDailySummaryForTelegram(
  summary: OpsDailySummary,
  options: { title?: string } = {},
) {
  return formatDailySummaryValues({
    title: options.title ?? `TalkTheme ${summary.day} 운영 요약`,
    day: summary.day,
    visitors: summary.visitors.visitors,
    sessions: summary.visitors.sessions,
    newUsers: summary.visitors.newUsers,
    visitorStatus: summary.visitors.status,
    signupCount: summary.signups,
    paymentsPaid: summary.paymentsPaid,
    paymentsPaidAmount: summary.paymentsPaidAmount,
    paymentFailures: summary.paymentFailures,
    refundsCount: summary.refundsCount,
    refundsAmount: summary.refundsAmount,
    refundsReviewRequired: summary.refundsReviewRequired,
    exportsSucceeded: summary.exportsSucceeded,
    exportsFailed: summary.exportsFailed,
    exportsPending: summary.exportsPending,
    inquiriesNew: summary.newInquiries,
    inquiriesOpen: summary.openInquiries,
    p1Issues: summary.p1Issues,
    p2Issues: summary.p2Issues,
    deadLetterNotifications: summary.deadLetterNotifications,
  });
}

export function formatOpsStatusForTelegram(status: OpsStatusSnapshot) {
  return [
    "📌 TalkTheme 운영 상태",
    "",
    `Export 대기: ${status.pendingExports}건 (15분 초과 ${status.staleExports}건)`,
    `알림 대기: ${status.pendingNotifications}건 · 재시도 ${status.retryNotifications}건 · dead-letter ${status.deadLetterNotifications}건`,
    `미종결 문의: ${status.openInquiries}건`,
    `Billing hold: ${status.billingHolds}건`,
    `최근 P1: ${status.lastP1At ? formatKoreanTime(status.lastP1At) : "없음"}`,
  ].join("\n");
}

export function formatOpsIssuesForTelegram(input: { events: OpsIssue[]; inquiries: OpsInquiryIssue[] }) {
  const lines = ["🧭 TalkTheme 최근 운영 이슈", ""];
  if (input.events.length === 0 && input.inquiries.length === 0) {
    lines.push("최근 P1/P2 이벤트와 미종결 문의가 없습니다.");
    return lines.join("\n");
  }

  if (input.events.length > 0) {
    lines.push("이벤트");
    for (const event of input.events) {
      const icon = event.severity === "P1" ? "🚨" : "⚠️";
      const entity = event.entityId ? ` · ${event.entityId}` : "";
      lines.push(`${icon} [${event.severity}] ${event.eventType}${entity}`, `  ${formatKoreanTime(event.occurredAt)}`);
    }
  }

  if (input.inquiries.length > 0) {
    if (input.events.length > 0) lines.push("");
    lines.push("미종결 문의");
    for (const inquiry of input.inquiries) {
      lines.push(`💬 ${inquiry.id} · ${inquiry.status} · ${formatKoreanTime(inquiry.createdAt)}`);
    }
  }
  return lines.join("\n");
}

export function formatOpsHealthForTelegram(input: {
  database: "ok" | "error";
  telegram: "configured" | "disabled" | "invalid";
  ga4: "configured" | "not_configured" | "invalid";
  status?: OpsStatusSnapshot;
}) {
  const databaseLabel = input.database === "ok" ? "정상" : "확인 실패";
  const telegramLabel = input.telegram === "configured" ? "설정 정상" : input.telegram === "disabled" ? "비활성" : "설정 오류";
  const ga4Label = input.ga4 === "configured" ? "설정됨" : input.ga4 === "not_configured" ? "미연동" : "설정 오류";
  return [
    "🩺 TalkTheme 운영 점검",
    "",
    `DB: ${databaseLabel}`,
    `Telegram: ${telegramLabel}`,
    `GA4 방문자 API: ${ga4Label}`,
    ...(input.status ? [`대기 Export: ${input.status.pendingExports}건 · 알림 dead-letter: ${input.status.deadLetterNotifications}건`] : []),
  ].join("\n");
}

export function formatTelegramTestMessage(options: { environment?: string; now?: Date } = {}) {
  const environment = options.environment?.trim() || "unknown";
  const now = options.now ?? new Date();
  return [
    "✅ TalkTheme Telegram 알림 테스트",
    "",
    `환경: ${environment}`,
    `발생 시각: ${formatKoreanTime(now.toISOString())}`,
  ].join("\n");
}

function formatKoreanTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatValue(value: OpsDetailValue) {
  if (value === null) return "-";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

function formatDailySummaryEvent(event: OpsEvent, options: { siteUrl?: string }) {
  const details = event.details;
  const message = formatDailySummaryValues({
    title: event.summary,
    day: readString(details.summaryDay) ?? formatKoreanDate(event.occurredAt),
    visitors: readNullableCount(details.visitorCount),
    sessions: readNullableCount(details.sessionCount),
    newUsers: readNullableCount(details.newUserCount),
    visitorStatus: readVisitorStatus(details.visitorStatus),
    signupCount: readCount(details.signupCount),
    paymentsPaid: readCount(details.paymentsPaid),
    paymentsPaidAmount: readCount(details.paymentsPaidAmount),
    paymentFailures: readCount(details.paymentFailures),
    refundsCount: readCount(details.refundsCount),
    refundsAmount: readCount(details.refundsAmount),
    refundsReviewRequired: readCount(details.refundsReviewRequired),
    exportsSucceeded: readCount(details.exportsSucceeded),
    exportsFailed: readCount(details.exportsFailed),
    exportsPending: readCount(details.exportsPending),
    inquiriesNew: readCount(details.inquiriesNew),
    inquiriesOpen: readCount(details.inquiriesOpen),
    p1Issues: readCount(details.p1Issues),
    p2Issues: readCount(details.p2Issues),
    deadLetterNotifications: readCount(details.deadLetterNotifications),
  });
  const adminUrl = buildAdminUrl(event.adminPath, options.siteUrl ?? getSiteUrl());
  return adminUrl ? `${message}\n\n관리자 확인: ${adminUrl}` : message;
}

function formatDailySummaryValues(input: {
  title: string;
  day: string;
  visitors: number | null;
  sessions: number | null;
  newUsers: number | null;
  visitorStatus: string;
  signupCount: number;
  paymentsPaid: number;
  paymentsPaidAmount: number;
  paymentFailures: number;
  refundsCount: number;
  refundsAmount: number;
  refundsReviewRequired: number;
  exportsSucceeded: number;
  exportsFailed: number;
  exportsPending: number;
  inquiriesNew: number;
  inquiriesOpen: number;
  p1Issues: number;
  p2Issues: number;
  deadLetterNotifications: number;
}) {
  const visitorLine = input.visitorStatus === "ok"
    ? `${formatNullableCount(input.visitors)}명 · 세션 ${formatNullableCount(input.sessions)} · 신규 ${formatNullableCount(input.newUsers)}`
    : `집계 불가 (${formatVisitorStatus(input.visitorStatus)})`;
  const refundReview = input.refundsReviewRequired > 0 ? ` · 검토 ${input.refundsReviewRequired}건` : "";
  return [
    `📊 ${input.title}`,
    "",
    `기준일: ${input.day} (KST)`,
    `방문자(GA4 동의 기준): ${visitorLine}`,
    `가입: ${input.signupCount}건`,
    `결제: ${input.paymentsPaid}건 · ${formatWon(input.paymentsPaidAmount)} · 실패/취소 ${input.paymentFailures}건`,
    `환불: ${input.refundsCount}건 · ${formatWon(input.refundsAmount)}${refundReview}`,
    `Export: 성공 ${input.exportsSucceeded}건 · 실패 ${input.exportsFailed}건 · 현재 대기 ${input.exportsPending}건`,
    `문의: 신규 ${input.inquiriesNew}건 · 미종결 ${input.inquiriesOpen}건`,
    `운영 이슈: P1 ${input.p1Issues}건 · P2 ${input.p2Issues}건`,
    `알림 dead-letter: ${input.deadLetterNotifications}건`,
  ].join("\n");
}

function formatWon(value: number) {
  return `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
}

function formatNullableCount(value: number | null) {
  return value === null ? "-" : String(value);
}

function readCount(value: OpsDetailValue | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readNullableCount(value: OpsDetailValue | undefined) {
  return value === null ? null : readCount(value);
}

function readString(value: OpsDetailValue | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readVisitorStatus(value: OpsDetailValue | undefined) {
  return typeof value === "string" ? value : "unavailable";
}

function formatVisitorStatus(value: string) {
  if (value === "not_configured") return "GA4 미연동";
  if (value === "invalid_config") return "GA4 설정 오류";
  return "GA4 조회 실패";
}

function formatKoreanDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function buildAdminUrl(path: string | undefined, siteUrl: string) {
  if (!path) return undefined;
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return undefined;
  }
}
