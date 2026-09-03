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

  it("renders a daily summary as a compact aggregate report", () => {
    const event = createOpsEvent({
      eventId: "ops.daily_summary:2026-09-02",
      type: "ops.daily_summary",
      severity: "P3",
      source: "ops",
      occurredAt: "2026-09-03T00:00:00.000Z",
      summary: "TalkTheme 2026-09-02 운영 요약",
      details: {
        summaryDay: "2026-09-02",
        visitorStatus: "ok",
        visitorCount: 12,
        sessionCount: 19,
        newUserCount: 5,
        signupCount: 2,
        paymentsPaid: 1,
        paymentsPaidAmount: 4900,
        paymentFailures: 0,
        refundsCount: 0,
        refundsAmount: 0,
        refundsReviewRequired: 0,
        exportsSucceeded: 3,
        exportsFailed: 1,
        exportsPending: 1,
        inquiriesNew: 1,
        inquiriesOpen: 1,
        p1Issues: 0,
        p2Issues: 1,
        deadLetterNotifications: 0,
      },
      dedupeKey: "ops:daily-summary:2026-09-02",
    });

    const message = formatOpsEventForTelegram(event);
    expect(message).toContain("📊 TalkTheme 2026-09-02 운영 요약");
    expect(message).toContain("방문자(GA4 동의 기준): 12명 · 세션 19 · 신규 5");
    expect(message).toContain("결제: 1건 · ₩4,900");
    expect(message).toContain("운영 이슈: P1 0건 · P2 1건");
  });
});
