import { describe, expect, it } from "vitest";
import {
  createExportFailureEvent,
  createGrobleWebhookProcessingEvent,
  createGrobleWebhookRejectedEvent,
  createExportRefundFailureEvent,
  createInquiryCreatedEvent,
  createInquiryUserReplyEvent,
  createOpsDailySummaryEvent,
} from "@/lib/ops/eventFactories";

const dailySummary = {
  day: "2026-09-02",
  startAt: "2026-09-01T15:00:00.000Z",
  endAt: "2026-09-02T15:00:00.000Z",
  signups: 2,
  paymentsPaid: 1,
  paymentsPaidAmount: 4900,
  paymentFailures: 0,
  refundsCount: 0,
  refundsAmount: 0,
  refundsReviewRequired: 0,
  exportsSucceeded: 3,
  exportsFailed: 1,
  exportsPending: 1,
  newInquiries: 1,
  openInquiries: 1,
  p1Issues: 0,
  p2Issues: 1,
  deadLetterNotifications: 0,
  visitors: { status: "ok" as const, visitors: 8, sessions: 10, newUsers: 4 },
};

describe("operational event factories", () => {
  it("creates a deterministic P1 watchdog event without user data", () => {
    const first = createExportFailureEvent({
      platform: "android",
      exportJobId: "job-123",
      errorCode: "build_watchdog_timeout",
      durationMs: 91.4,
      watchdog: true,
    });
    const second = createExportFailureEvent({
      platform: "android",
      exportJobId: "job-123",
      errorCode: "build_watchdog_timeout",
      durationMs: 91.4,
      watchdog: true,
    });

    expect(second.eventId).toBe(first.eventId);
    expect(second.dedupeKey).toBe(first.dedupeKey);
    expect(first).toMatchObject({
      eventId: "export.watchdog_timeout:android:job-123:build_watchdog_timeout",
      type: "export.watchdog_timeout",
      severity: "P1",
      source: "export",
      entity: { kind: "export_job", id: "job-123" },
      details: { platform: "android", errorCode: "build_watchdog_timeout", durationMs: 91 },
      adminPath: "/admin",
    });
    expect(JSON.stringify(first)).not.toContain("email");
  });

  it("distinguishes a review-required billing result as P1", () => {
    const event = createGrobleWebhookProcessingEvent({
      eventId: "evt-1",
      eventType: "payment.completed",
      result: "review_required",
      occurredAt: "2026-08-30T06:00:00Z",
    });

    expect(event.severity).toBe("P1");
    expect(event.details).toEqual({
      providerEventId: "evt-1",
      providerEventType: "payment.completed",
      result: "review_required",
    });
  });

  it("uses provider metadata only for rejected webhook alerts", () => {
    const event = createGrobleWebhookRejectedEvent({
      errorCode: "unsupported_version",
      eventId: "evt-2",
      eventType: "payment.completed",
      occurredAt: "2026-08-30T06:00:00Z",
    });

    expect(event.type).toBe("billing.webhook_rejected");
    expect(event.details).toEqual({
      providerEventId: "evt-2",
      providerEventType: "payment.completed",
      errorCode: "unsupported_version",
    });
    expect(JSON.stringify(event)).not.toContain("payload");
  });

  it("marks failed credit settlement as a P1 billing event", () => {
    const event = createExportRefundFailureEvent({
      platform: "ios",
      exportJobId: "job-456",
      errorCode: "billing_hold",
    });

    expect(event).toMatchObject({
      type: "billing.refund_failed",
      severity: "P1",
      source: "billing",
      entity: { kind: "export_job", id: "job-456" },
    });
  });

  it("creates a sanitized P2 event for a new inquiry", () => {
    const event = createInquiryCreatedEvent({
      inquiryId: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
      category: "payment",
      title: "결제 문의 owner@example.com 010-1234-5678",
    });

    expect(event).toMatchObject({
      eventId: "inquiry.created:8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
      type: "inquiry.created",
      severity: "P2",
      source: "admin",
      entity: { kind: "inquiry", id: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8" },
      details: {
        inquiryId: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
        category: "payment",
        title: "결제 문의 [redacted-email] [redacted-phone]",
      },
      dedupeKey: "inquiry:created:8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
      adminPath: "/admin/inquiries/8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
    });
    expect(JSON.stringify(event)).not.toContain("owner@example.com");
    expect(JSON.stringify(event)).not.toContain("010-1234-5678");
  });

  it("deduplicates each user follow-up by message id", () => {
    const event = createInquiryUserReplyEvent({
      inquiryId: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
      messageId: "4bc5f1f7-3d7b-4e7f-9a5e-2e4b5fd31d7e",
    });

    expect(event).toMatchObject({
      eventId: "inquiry.user_replied:4bc5f1f7-3d7b-4e7f-9a5e-2e4b5fd31d7e",
      type: "inquiry.user_replied",
      severity: "P2",
      entity: { kind: "inquiry", id: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8" },
      details: {
        inquiryId: "8c7202d6-8c50-44e4-936d-c12bfba9f1d8",
        messageId: "4bc5f1f7-3d7b-4e7f-9a5e-2e4b5fd31d7e",
      },
      dedupeKey: "inquiry:user-replied:4bc5f1f7-3d7b-4e7f-9a5e-2e4b5fd31d7e",
    });
  });

  it("creates one P3 event per KST summary day with aggregate-only details", () => {
    const event = createOpsDailySummaryEvent(dailySummary, "2026-09-03T00:00:00.000Z");

    expect(event).toMatchObject({
      eventId: "ops.daily_summary:2026-09-02",
      type: "ops.daily_summary",
      severity: "P3",
      source: "ops",
      dedupeKey: "ops:daily-summary:2026-09-02",
      details: {
        summaryDay: "2026-09-02",
        visitorCount: 8,
        signupCount: 2,
        paymentsPaidAmount: 4900,
      },
    });
    expect(JSON.stringify(event)).not.toContain("email");
  });
});
