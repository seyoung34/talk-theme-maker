import { getSiteUrl } from "@/lib/supabase/config";
import type { OpsEvent, OpsDetailValue } from "@/lib/ops/events";
import type { OpsDailySummary, OpsWeekSummary } from "@/lib/ops/dailySummary";
import type { OpsIssue, OpsInquiryIssue, OpsRecentExport, OpsStatusSnapshot } from "@/lib/ops/repository";

/** 운영자가 읽는 이름. 원래 타입 코드는 메시지 맨 아래 `코드:` 줄에 남는다. */
const eventTypeLabels: Partial<Record<OpsEvent["type"], string>> = {
  "export.enqueue_failed": "Export 접수 실패",
  "export.failed": "Export 실패",
  "export.watchdog_timeout": "Export 시간 초과",
  "export.failure_spike": "Export 실패 급증",
  "billing.webhook_rejected": "결제 웹훅 거부",
  "billing.webhook_processing_failed": "결제 웹훅 처리 실패",
  "billing.refund_failed": "환불 실패",
  "runtime.health_failed": "런타임 점검 실패",
  "admin.template_published": "템플릿 게시",
  "inquiry.created": "새 문의",
  "inquiry.user_replied": "문의 답장",
  "ops.daily_summary": "일일 요약",
};

const entityKindLabels: Record<NonNullable<OpsEvent["entity"]>["kind"], string> = {
  export_job: "Export 작업",
  payment: "결제",
  template: "템플릿",
  runtime: "런타임",
  inquiry: "문의",
};

const severityIcon: Record<OpsEvent["severity"], string> = {
  P1: "🚨",
  P2: "⚠️",
  P3: "ℹ️",
};

const detailLabels: Record<string, string> = {
  correlationId: "요청 상관 ID",
  operation: "작업",
  stage: "단계",
  route: "경로",
  deploymentVersion: "배포 버전",
  platform: "플랫폼",
  errorCode: "오류 코드",
  durationMs: "소요 시간(ms)",
  elapsedMs: "경과 시간(ms)",
  attemptCount: "시도 횟수",
  providerEventType: "결제사 이벤트",
  providerEventId: "결제사 이벤트 ID",
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
  deadLetterNotifications: "전송 포기 알림",
  inquiryId: "문의 ID",
  messageId: "메시지 ID",
  category: "문의 분류",
};

export function formatOpsEventForTelegram(event: OpsEvent, options: { siteUrl?: string } = {}) {
  if (event.type === "ops.daily_summary") return formatDailySummaryEvent(event, options);

  const lines = [
    `${severityIcon[event.severity]} [${event.severity}] ${event.summary}`,
    "",
    `발생: ${formatKoreanTime(event.occurredAt)}`,
  ];

  if (event.entity) lines.push(`${entityKindLabels[event.entity.kind]}: ${event.entity.id}`);

  for (const [key, value] of Object.entries(event.details)) {
    if (!(key in detailLabels)) continue;
    lines.push(`${detailLabels[key] ?? key}: ${formatDetailValue(key, value)}`);
  }

  const adminUrl = buildAdminUrl(event.adminPath, options.siteUrl ?? getSiteUrl());
  lines.push("");
  if (adminUrl) lines.push(`관리자 확인: ${adminUrl}`);
  // 제목(summary)이 이미 무슨 일인지 말하므로, 타입 코드는 로그 검색용으로 맨 아래에 둔다.
  lines.push(`코드: ${event.type}`);

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
    `알림 대기: ${status.pendingNotifications}건 · 재시도 ${status.retryNotifications}건 · 전송 포기 ${status.deadLetterNotifications}건`,
    `미종결 문의: ${status.openInquiries}건`,
    `결제 보류: ${status.billingHolds}건`,
    `최근 P1: ${status.lastP1At ? formatKoreanTime(status.lastP1At) : "없음"}`,
  ].join("\n");
}

const inquiryStatusLabels: Record<OpsInquiryIssue["status"], string> = {
  open: "답변 대기",
  answered: "답변함",
};

/**
 * `sendTelegramMessage`는 3,800자에서 말없이 자른다. 목록이 그 안에서 끝나도록 여기서 먼저 멈추고,
 * 생략한 건수를 적는다. 잘린 줄 없이 끝나야 운영자가 "이게 전부"라고 오해하지 않는다.
 */
const telegramListBudget = 3_600;

export function formatOpsIssuesForTelegram(input: { events: OpsIssue[]; inquiries: OpsInquiryIssue[] }) {
  const lines = ["🧭 TalkTheme 최근 운영 이슈", ""];
  if (input.events.length === 0 && input.inquiries.length === 0) {
    lines.push("최근 P1/P2 이벤트와 미종결 문의가 없습니다.");
    return lines.join("\n");
  }

  let length = lines.join("\n").length;
  let omitted = 0;
  const append = (block: string[]) => {
    const added = block.join("\n").length + 1;
    if (omitted > 0 || length + added > telegramListBudget) return false;
    lines.push(...block);
    length += added;
    return true;
  };

  if (input.events.length > 0) {
    append(["이벤트"]);
    for (const event of input.events) {
      const icon = event.severity === "P1" ? "🚨" : "⚠️";
      const entity = event.entityId ? ` · ${event.entityId}` : "";
      if (!append([
        `${icon} [${event.severity}] ${eventTypeLabels[event.eventType] ?? event.eventType}${entity}`,
        `  이벤트 ID: ${formatOpsIdentifier(event.eventId)}`,
        `  ${formatKoreanTime(event.occurredAt)}`,
      ])) omitted += 1;
    }
  }

  if (input.inquiries.length > 0) {
    append([...(input.events.length > 0 ? [""] : []), "미종결 문의"]);
    for (const inquiry of input.inquiries) {
      if (!append([`💬 ${inquiry.id} · ${inquiryStatusLabels[inquiry.status]} · ${formatKoreanTime(inquiry.createdAt)}`])) omitted += 1;
    }
  }

  if (omitted > 0) lines.push("", `… 메시지 길이 제한으로 ${omitted}건을 생략했습니다. 숫자를 줄여 /issues N 으로 다시 조회하세요.`);
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
    ...(input.status ? [`대기 Export: ${input.status.pendingExports}건 · 알림 전송 포기: ${input.status.deadLetterNotifications}건`] : []),
  ].join("\n");
}

const exportStatusLabels: Record<string, { icon: string; label: string }> = {
  succeeded: { icon: "✅", label: "성공" },
  failed: { icon: "❌", label: "실패" },
  pending: { icon: "⏳", label: "진행 중" },
};

const exportStageLabels: Record<string, string> = {
  queued: "대기",
  preparing: "준비",
  building: "빌드",
  packaging: "패키징",
  finalizing: "마무리",
  completed: "완료",
  failed: "실패",
};

const exportPlatformLabels: Record<string, string> = { android: "Android", ios: "iOS" };

/**
 * `/exports` 응답. 값은 알려진 라벨로만 바꾸고, 모르는 값은 원문 대신 "알 수 없음"으로 쓴다 —
 * 운영 채팅으로 나가는 문자열에 DB 텍스트를 그대로 흘리지 않는다. 오류 코드는 조회 시점에 이미
 * 코드 문자만 남겼다(`parseOpsRecentExport`).
 */
export function formatOpsExportsForTelegram(jobs: OpsRecentExport[]) {
  const lines = [`📦 TalkTheme 최근 Export ${jobs.length}건`, ""];
  if (jobs.length === 0) {
    lines.push("최근 Export가 없습니다.");
    return lines.join("\n");
  }

  for (const job of jobs) {
    const status = exportStatusLabels[job.status] ?? { icon: "❔", label: "알 수 없음" };
    const platform = exportPlatformLabels[job.platform] ?? "알 수 없음";
    // 성공은 단계가 항상 "완료"라 생략한다. 실패·진행 중은 어디서 멈췄는지가 핵심이다.
    const stage = job.status === "succeeded" ? "" : ` (${exportStageLabels[job.stage] ?? "알 수 없음"})`;
    const facts = [
      formatOpsIdentifier(job.id).slice(0, 8),
      job.durationMs === null ? "-" : formatExportDuration(job.durationMs),
      ...(job.errorCode ? [`오류 ${job.errorCode}`] : []),
      ...(job.referencedFileCount > 0 ? [`참조 ${job.referencedFileCount}개`] : []),
    ];
    lines.push(
      `${status.icon} ${formatKoreanTime(job.createdAt)} · ${platform} · ${status.label}${stage}`,
      `   ${facts.join(" · ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * `/week` 응답. **기간 값과 현재 값을 섞지 않는다.** RPC는 `exportsPending`·`openInquiries`를 구간과
 * 무관하게 조회 시점 값으로 돌려준다(`readOpsWeekSummary` 참고).
 */
export function formatOpsWeekSummaryForTelegram(summary: OpsWeekSummary) {
  const refundReview = summary.refundsReviewRequired > 0 ? ` · 검토 ${summary.refundsReviewRequired}건` : "";
  return [
    "🗓 TalkTheme 주간 요약",
    `기간: ${formatKoreanDay(summary.firstDay)} ~ ${formatKoreanDay(summary.lastDay)} (KST, 오늘 제외)`,
    "",
    "방문자(GA4): 미집계",
    `가입: ${summary.signups}건`,
    `결제: ${summary.paymentsPaid}건 · ${formatWon(summary.paymentsPaidAmount)} · 실패/취소 ${summary.paymentFailures}건`,
    `환불: ${summary.refundsCount}건 · ${formatWon(summary.refundsAmount)}${refundReview}`,
    `Export: 성공 ${summary.exportsSucceeded}건 · 실패 ${summary.exportsFailed}건`,
    `문의: 신규 ${summary.newInquiries}건`,
    `운영 이슈: P1 ${summary.p1Issues}건 · P2 ${summary.p2Issues}건`,
    `알림 전송 포기: ${summary.deadLetterNotifications}건`,
    "",
    "지금 기준",
    `Export 대기: ${summary.exportsPending}건 · 미종결 문의: ${summary.openInquiries}건`,
    "",
    "결제·환불·전송 포기는 현재 상태로 다시 센 값이라 일일 요약 7개의 합과 다를 수 있습니다.",
  ].join("\n");
}

export function formatTelegramTestMessage(options: { environment?: string; now?: Date } = {}) {
  const environment = options.environment?.trim() || "unknown";
  const now = options.now ?? new Date();
  return [
    "✅ TalkTheme Telegram 알림 테스트",
    "",
    `환경: ${environment}`,
    `발생: ${formatKoreanTime(now.toISOString())}`,
  ].join("\n");
}

const kstParts = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23: 자정을 "24:00"이 아니라 "00:00"으로 쓴다.
  hourCycle: "h23",
});

/**
 * `10/23(금) 23:05:02 KST`.
 *
 * 독립 감시기(`services/runtime-monitor/format.ts`)와 같은 형식이다. 감시기는 앱과 따로 빌드되는
 * 서비스라 코드를 공유하지 않고 형식만 맞춘다 — 한쪽을 바꾸면 다른 쪽도 함께 바꾼다.
 */
export function formatKoreanTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = readKstParts(date);
  return `${parts.date} ${parts.time} KST`;
}

function readKstParts(date: Date) {
  const parts = Object.fromEntries(kstParts.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.month}/${parts.day}(${parts.weekday})`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

/**
 * 값이 정해진 몇 가지 상세 항목만 한글로 바꾼다. 모르는 값은 원문을 남긴다 — 이벤트 상세는 앱이
 * 직접 만들어 `createOpsEvent`가 이미 걸렀으므로, 버리기보다 그대로 보이는 편이 진단에 낫다.
 */
function formatDetailValue(key: string, value: OpsDetailValue) {
  if (typeof value === "string") {
    if (key === "platform") return exportPlatformLabels[value] ?? value;
    if (key === "stage") return exportStageLabels[value] ?? value;
  }
  return formatValue(value);
}

function formatValue(value: OpsDetailValue) {
  if (value === null) return "-";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

function formatDailySummaryEvent(event: OpsEvent, options: { siteUrl?: string }) {
  const details = event.details;
  if (details.summaryMode === "ga4_correction") {
    const visitorLine = readVisitorStatus(details.visitorStatus) === "ok"
      ? `${formatNullableCount(readNullableCount(details.visitorCount))}명 · 세션 ${formatNullableCount(readNullableCount(details.sessionCount))} · 신규 ${formatNullableCount(readNullableCount(details.newUserCount))}`
      : `집계 대기 (${formatVisitorStatus(readVisitorStatus(details.visitorStatus))})`;
    return `📈 ${event.summary}\n\n기준일: ${readString(details.summaryDay) ?? formatKoreanDate(event.occurredAt)} (KST)\n방문자(GA4 동의 기준): ${visitorLine}`;
  }
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
    : input.visitorStatus === "pending"
      ? "집계 대기 (GA4 처리 중)"
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
    `알림 전송 포기: ${input.deadLetterNotifications}건`,
  ].join("\n");
}

/** `2026-10-16` → `10/16(금)`. 날짜 문자열은 KST 날짜다. */
function formatKoreanDay(day: string) {
  // 정오로 잡아 어느 시간대에서 해석해도 같은 KST 날짜가 나오게 한다.
  const date = new Date(`${day}T12:00:00+09:00`);
  return Number.isFinite(date.getTime()) ? readKstParts(date).date : day;
}

/** 소요 시간. 1분 미만은 소수 한 자리 초, 그 이상은 분·초. */
function formatExportDuration(ms: number) {
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}초`;
  const seconds = Math.round(ms / 1_000);
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
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
  if (value === "pending") return "GA4 처리 중";
  if (value === "not_configured") return "GA4 미연동";
  if (value === "invalid_config") return "GA4 설정 오류";
  return "GA4 조회 실패";
}

function formatKoreanDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function formatOpsIdentifier(value: string, maxLength = 80) {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function buildAdminUrl(path: string | undefined, siteUrl: string) {
  if (!path) return undefined;
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return undefined;
  }
}
