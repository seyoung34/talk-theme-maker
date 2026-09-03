import { describe, expect, it } from "vitest";
import {
  createOpsEvent,
  deterministicOpsEventId,
  sanitizeDetails,
} from "@/lib/ops/events";

describe("ops events", () => {
  it("creates deterministic IDs for terminal events", () => {
    expect(deterministicOpsEventId("export.failed", "android", "job-1", "builder_failed"))
      .toBe("export.failed:android:job-1:builder_failed");
  });

  it("removes sensitive fields and redacts values before persistence", () => {
    expect(sanitizeDetails({
      email: "owner@example.com",
      customer: "010-1234-5678",
      errorCode: "builder_failed",
      signedUrl: "https://storage.example/download?token=secret",
      platform: "android",
    })).toEqual({ customer: "[redacted-phone]", errorCode: "builder_failed", platform: "android" });
  });

  it("only accepts an internal admin path", () => {
    const event = createOpsEvent({
      eventId: "event-1",
      type: "runtime.health_failed",
      severity: "P1",
      source: "runtime",
      summary: "Health check failed",
      details: { dependency: "supabase" },
      adminPath: "https://attacker.example/collect",
    });
    expect(event.adminPath).toBeUndefined();
  });

  it("rejects unsupported enum values at event construction time", () => {
    expect(() => createOpsEvent({
      eventId: "event-2",
      type: "runtime.unknown" as never,
      severity: "P1",
      source: "runtime",
      summary: "Health check failed",
    })).toThrow("invalid_ops_event_type");
  });
});
