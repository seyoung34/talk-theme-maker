import { describe, expect, it } from "vitest";
import { createOpsEvent } from "@/lib/ops/events";
import { formatOpsEventForTelegram } from "@/lib/ops/formatters";

describe("Telegram message formatter", () => {
  it("renders severity, entity, safe details, and an admin link", () => {
    const event = createOpsEvent({
      eventId: "event-1",
      type: "export.watchdog_timeout",
      severity: "P1",
      source: "export",
      occurredAt: "2026-08-30T00:00:00.000Z",
      entity: { kind: "export_job", id: "job-1" },
      summary: "Android export timed out",
      details: { platform: "android", errorCode: "build_watchdog_timeout", internalNote: "must not be sent" },
      adminPath: "/admin",
    });

    const message = formatOpsEventForTelegram(event, { siteUrl: "https://talktheme.example" });
    expect(message).toContain("🚨 [P1] Android export timed out");
    expect(message).toContain("export_job: job-1");
    expect(message).toContain("오류 코드: build_watchdog_timeout");
    expect(message).toContain("관리자 확인: https://talktheme.example/admin");
    expect(message).not.toContain("internalNote");
  });
});
