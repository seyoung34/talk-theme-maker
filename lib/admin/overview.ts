import type { OpsDailySummaryCounts, OpsIssue, OpsStatusSnapshot } from "@/lib/ops/repository";
import type { OpsEventType } from "@/lib/ops/events";

/**
 * 관리자 개요 카드 조립.
 *
 * 조회와 화면 사이의 순수 계층이다. 조회 하나가 실패해도 나머지 카드는 그려야 하므로 입력은
 * 조회별 성공/실패로 받고, 실패한 카드는 값 대신 `unavailable`로 표시한다 — 0으로 대체하면
 * "처리할 일 없음"과 "확인 못 함"이 구분되지 않는다.
 */

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export type AdminOverviewInput = {
  snapshot: Loaded<OpsStatusSnapshot>;
  openInquiries: Loaded<number>;
  refundReviews: Loaded<number>;
  /** 오래된 날부터 오늘까지(KST). 마지막 항목이 오늘이다. 날짜별로 따로 성공/실패한다. */
  days: OverviewDayInput[];
  issues: Loaded<OpsIssue[]>;
};

export type OverviewDayInput = { day: string; counts: Loaded<OpsDailySummaryCounts> };

/** 추이의 한 점. 조회 실패한 날은 null — 0으로 그리면 "없었음"과 "모름"이 섞인다. */
export type TrendPoint = { day: string; value: number | null };

export type OverviewHistoryRow = {
  day: string;
  counts?: OpsDailySummaryCounts;
};

export type OverviewCard = {
  id: string;
  label: string;
  /** 표시할 큰 숫자. 조회 실패면 undefined. */
  value?: string;
  hint?: string;
  href?: string;
  /** 처리 필요 카드가 0보다 클 때 강조한다. */
  emphasized: boolean;
  unavailable: boolean;
  /** 최근 날짜별 값. 오늘 카드에만 있다. */
  trend?: TrendPoint[];
};

export type OverviewIssue = {
  id: string;
  severity: "P1" | "P2";
  label: string;
  occurredAt: string;
};

export type AdminOverview = {
  attention: OverviewCard[];
  today: OverviewCard[];
  /** 표 보기용. 차트와 같은 값을 그대로 읽을 수 있게 한다. */
  history: OverviewHistoryRow[];
  issues: Loaded<OverviewIssue[]>;
};

export function buildAdminOverview(input: AdminOverviewInput): AdminOverview {
  return {
    attention: buildOverviewAttention(input),
    ...buildOverviewActivity(input.days),
    issues: buildOverviewIssues(input.issues),
  };
}

export function buildOverviewAttention(input: Pick<AdminOverviewInput, "snapshot" | "openInquiries" | "refundReviews">): OverviewCard[] {
  const snapshot = input.snapshot.ok ? input.snapshot.value : undefined;
  return [
      attentionCard("open-inquiries", "답변 대기 문의", input.openInquiries.ok ? input.openInquiries.value : undefined, {
        href: "/admin/inquiries",
        hint: "아직 답하지 않은 문의",
      }),
      attentionCard("refund-reviews", "환불 검토 필요", input.refundReviews.ok ? input.refundReviews.value : undefined, {
        hint: "기간과 무관한 미처리 전체",
      }),
      attentionCard("stale-exports", "멈춘 export", snapshot?.staleExports, { href: "/admin/exports", hint: "15분 넘게 대기 중" }),
      attentionCard("billing-holds", "결제 보류 계정", snapshot?.billingHolds, { hint: "결제 보류로 export가 막힌 계정" }),
      attentionCard("dead-letters", "알림 전송 실패", snapshot?.deadLetterNotifications, { hint: "재시도를 멈춘 텔레그램 알림" }),
  ];
}

export function buildOverviewActivity(days: OverviewDayInput[]): Pick<AdminOverview, "today" | "history"> {
  const lastDay = days.at(-1);
  const today = lastDay?.counts.ok ? lastDay.counts.value : undefined;
  const trend = (pick: (counts: OpsDailySummaryCounts) => number): TrendPoint[] =>
    days.map(({ day, counts }) => ({ day, value: counts.ok ? pick(counts.value) : null }));
  return {
    today: [
      todayCard("signups", "가입", today?.signups, { href: "/admin/analytics", trend: trend((counts) => counts.signups) }),
      todayCard("payments", "결제", today?.paymentsPaid, {
        hint: today ? `${formatWon(today.paymentsPaidAmount)} · 실패 ${formatCount(today.paymentFailures)}` : undefined,
        trend: trend((counts) => counts.paymentsPaid),
      }),
      todayCard("refunds", "환불", today?.refundsCount, {
        hint: today ? formatWon(today.refundsAmount) : undefined,
        trend: trend((counts) => counts.refundsCount),
      }),
      todayCard("exports", "export 성공", today?.exportsSucceeded, {
        hint: today ? `실패 ${formatCount(today.exportsFailed)} · 대기 ${formatCount(today.exportsPending)}` : undefined,
        trend: trend((counts) => counts.exportsSucceeded),
      }),
      todayCard("issues", "P1·P2 이슈", today ? today.p1Issues + today.p2Issues : undefined, {
        hint: today ? `P1 ${formatCount(today.p1Issues)} · P2 ${formatCount(today.p2Issues)}` : undefined,
        trend: trend((counts) => counts.p1Issues + counts.p2Issues),
      }),
    ],
    history: days.map(({ day, counts }) => (counts.ok ? { day, counts: counts.value } : { day })),
  };
}

export function buildOverviewIssues(issues: Loaded<OpsIssue[]>): AdminOverview["issues"] {
  return issues.ok
      ? {
          ok: true,
          value: issues.value.map((issue) => ({
            id: issue.eventId,
            severity: issue.severity,
            label: opsEventLabels[issue.eventType] ?? issue.eventType,
            occurredAt: issue.occurredAt,
          })),
        }
      : { ok: false };
}

const opsEventLabels: Record<OpsEventType, string> = {
  "export.enqueue_failed": "export 대기열 등록 실패",
  "export.failed": "export 실패",
  "export.watchdog_timeout": "export 시간 초과",
  "export.failure_spike": "export 실패 급증",
  "billing.webhook_rejected": "결제 웹훅 거절",
  "billing.webhook_processing_failed": "결제 웹훅 처리 실패",
  "billing.refund_failed": "환불 실패",
  "runtime.health_failed": "런타임 상태 확인 실패",
  "admin.template_published": "템플릿 게시",
  "inquiry.created": "새 문의",
  "inquiry.user_replied": "문의 추가 답신",
  "ops.daily_summary": "일일 요약",
};

function attentionCard(id: string, label: string, value: number | undefined, options: { href?: string; hint?: string }): OverviewCard {
  return {
    id,
    label,
    value: value === undefined ? undefined : formatCount(value),
    hint: options.hint,
    href: options.href,
    emphasized: value !== undefined && value > 0,
    unavailable: value === undefined,
  };
}

function todayCard(id: string, label: string, value: number | undefined, options: { href?: string; hint?: string; trend: TrendPoint[] }): OverviewCard {
  return {
    id,
    label,
    value: value === undefined ? undefined : formatCount(value),
    hint: options.hint,
    href: options.href,
    emphasized: false,
    unavailable: value === undefined,
    // 값이 하나도 없으면 빈 선 대신 추이를 숨긴다.
    trend: options.trend.some((point) => point.value !== null) ? options.trend : undefined,
  };
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}
