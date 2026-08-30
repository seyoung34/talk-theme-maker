import { describe, expect, it } from "vitest";
import {
  createExportFailureEvent,
  createGrobleWebhookProcessingEvent,
  createGrobleWebhookRejectedEvent,
  createExportRefundFailureEvent,
} from "@/lib/ops/eventFactories";

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
});
