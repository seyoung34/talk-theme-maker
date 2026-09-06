import {
  createOpsEvent,
  deterministicOpsEventId,
  type OpsEvent,
  type OpsSeverity,
} from "@/lib/ops/events";
import type { OpsDailySummary } from "@/lib/ops/dailySummary";

export function createExportFailureEvent(input: {
  platform: "android" | "ios";
  exportJobId: string;
  errorCode: string;
  durationMs?: number;
  watchdog?: boolean;
}) {
  const type = input.watchdog ? "export.watchdog_timeout" : "export.failed";
  const severity: OpsSeverity = input.watchdog ? "P1" : "P2";
  return createOpsEvent({
    eventId: deterministicOpsEventId(type, input.platform, input.exportJobId, input.errorCode),
    type,
    severity,
    source: "export",
    entity: { kind: "export_job", id: input.exportJobId },
    summary: `${capitalize(input.platform)} export 작업이 ${input.watchdog ? "시간 초과" : "실패"}했습니다.`,
    details: {
      platform: input.platform,
      errorCode: input.errorCode,
      ...(typeof input.durationMs === "number" ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
    },
    dedupeKey: `export:${input.platform}:${input.exportJobId}:${type}`,
    adminPath: "/admin",
  });
}

export function createExportEnqueueFailureEvent(input: {
  platform: "android" | "ios";
  exportJobId?: string | null;
  errorCode: string;
  durationMs?: number;
}) {
  const bucket = Math.floor(Date.now() / 60_000);
  const stablePart = input.exportJobId || `${input.errorCode}:${bucket}`;
  return createOpsEvent({
    eventId: deterministicOpsEventId("export.enqueue_failed", input.platform, stablePart),
    type: "export.enqueue_failed",
    severity: "P2",
    source: "export",
    ...(input.exportJobId ? { entity: { kind: "export_job", id: input.exportJobId } } : {}),
    summary: `${capitalize(input.platform)} export 작업을 시작하지 못했습니다.`,
    details: {
      platform: input.platform,
      errorCode: input.errorCode,
      ...(typeof input.durationMs === "number" ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
    },
    dedupeKey: `export:enqueue:${input.platform}:${stablePart}`,
    adminPath: "/admin",
  });
}

export function createGrobleWebhookRejectedEvent(input: {
  errorCode: string;
  eventId: string | null;
  eventType: string | null;
  occurredAt: string | null;
}) {
  const providerEventId = input.eventId || `unknown-${Math.floor(Date.now() / 60_000)}`;
  return createOpsEvent({
    eventId: deterministicOpsEventId("billing.webhook_rejected", providerEventId, input.errorCode),
    type: "billing.webhook_rejected",
    severity: "P2",
    source: "billing",
    summary: "Groble 결제 웹훅이 격리되었습니다.",
    occurredAt: input.occurredAt ?? undefined,
    details: {
      providerEventId,
      providerEventType: input.eventType ?? "unknown",
      errorCode: input.errorCode,
    },
    dedupeKey: `billing:webhook:rejected:${providerEventId}:${input.errorCode}`,
    adminPath: "/admin",
  });
}

export function createGrobleWebhookProcessingEvent(input: {
  eventId: string;
  eventType: string;
  result: "rejected" | "review_required";
  occurredAt: string;
}) {
  const reviewRequired = input.result === "review_required";
  return createOpsEvent({
    eventId: deterministicOpsEventId("billing.webhook_processing_failed", input.eventId, input.result),
    type: "billing.webhook_processing_failed",
    severity: reviewRequired ? "P1" : "P2",
    source: "billing",
    summary: reviewRequired ? "결제 이벤트가 운영자 검토 상태가 되었습니다." : "결제 웹훅 정산이 거절되었습니다.",
    occurredAt: input.occurredAt,
    details: {
      providerEventId: input.eventId,
      providerEventType: input.eventType,
      result: input.result,
    },
    dedupeKey: `billing:webhook:${input.eventId}:${input.result}`,
    adminPath: "/admin",
  });
}

export function createGrobleWebhookTemporaryFailureEvent(input: {
  eventId: string | null;
  eventType: string | null;
  errorCode: string;
  occurredAt: string | null;
}) {
  const providerEventId = input.eventId || `unknown-${Math.floor(Date.now() / 60_000)}`;
  return createOpsEvent({
    eventId: deterministicOpsEventId("billing.webhook_processing_failed", providerEventId, input.errorCode),
    type: "billing.webhook_processing_failed",
    severity: "P1",
    source: "billing",
    summary: "결제 웹훅 처리 중 서버 오류가 발생했습니다.",
    occurredAt: input.occurredAt ?? undefined,
    details: {
      providerEventId,
      providerEventType: input.eventType ?? "unknown",
      errorCode: input.errorCode,
    },
    dedupeKey: `billing:webhook:temporary:${providerEventId}:${input.errorCode}`,
    adminPath: "/admin",
  });
}

export function createExportRefundFailureEvent(input: {
  platform: "android" | "ios";
  exportJobId: string;
  errorCode: string;
}) {
  return createOpsEvent({
    eventId: deterministicOpsEventId("billing.refund_failed", input.platform, input.exportJobId, input.errorCode),
    type: "billing.refund_failed",
    severity: "P1",
    source: "billing",
    entity: { kind: "export_job", id: input.exportJobId },
    summary: "export 실패 후 크레딧 환불 정산에 실패했습니다.",
    details: {
      platform: input.platform,
      errorCode: input.errorCode,
    },
    dedupeKey: `billing:refund:${input.platform}:${input.exportJobId}:${input.errorCode}`,
    adminPath: "/admin",
  });
}

export function createOpsDailySummaryEvent(input: OpsDailySummary, occurredAt = new Date().toISOString()) {
  return createOpsEvent({
    eventId: deterministicOpsEventId("ops.daily_summary", input.day),
    type: "ops.daily_summary",
    severity: "P3",
    source: "ops",
    occurredAt,
    summary: `TalkTheme ${input.day} 운영 요약`,
    details: {
      summaryDay: input.day,
      visitorStatus: input.visitors.status,
      visitorCount: input.visitors.visitors,
      sessionCount: input.visitors.sessions,
      newUserCount: input.visitors.newUsers,
      signupCount: input.signups,
      paymentsPaid: input.paymentsPaid,
      paymentsPaidAmount: input.paymentsPaidAmount,
      paymentFailures: input.paymentFailures,
      refundsCount: input.refundsCount,
      refundsAmount: input.refundsAmount,
      refundsReviewRequired: input.refundsReviewRequired,
      exportsSucceeded: input.exportsSucceeded,
      exportsFailed: input.exportsFailed,
      exportsPending: input.exportsPending,
      inquiriesNew: input.newInquiries,
      inquiriesOpen: input.openInquiries,
      p1Issues: input.p1Issues,
      p2Issues: input.p2Issues,
      deadLetterNotifications: input.deadLetterNotifications,
    },
    dedupeKey: `ops:daily-summary:${input.day}`,
    adminPath: "/admin",
  });
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export type { OpsEvent };
