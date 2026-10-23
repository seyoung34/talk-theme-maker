import { describe, expect, it } from "vitest";
import { createOpsEvent } from "@/lib/ops/events";
import {
  formatKoreanTime,
  formatOpsEventForTelegram,
  formatOpsExportsForTelegram,
  formatOpsIssuesForTelegram,
  formatOpsStatusForTelegram,
  formatOpsWeekSummaryForTelegram,
  formatTelegramTestMessage,
} from "@/lib/ops/formatters";
import { opsRecentExportColumns, parseOpsRecentExport, type OpsRecentExport } from "@/lib/ops/repository";

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
    expect(message).toContain("발생: 08/30(일) 09:00:00 KST");
    expect(message).toContain("Export 작업: job-1");
    expect(message).toContain("플랫폼: Android");
    expect(message).toContain("오류 코드: build_watchdog_timeout");
    expect(message).toContain("관리자 확인: https://talktheme.example/admin");
    expect(message).not.toContain("internalNote");
    // 타입 코드는 본문이 아니라 맨 끝 한 줄로 남는다.
    expect(message.endsWith("\n코드: export.watchdog_timeout")).toBe(true);
    expect(message).not.toContain("이벤트: ");
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

  it("renders inquiry context without including a message body", () => {
    const event = createOpsEvent({
      eventId: "inquiry.created:inquiry-1",
      type: "inquiry.created",
      severity: "P2",
      source: "admin",
      occurredAt: "2026-09-21T01:00:00.000Z",
      entity: { kind: "inquiry", id: "inquiry-1" },
      summary: "새 문의가 접수되었습니다.",
      details: { inquiryId: "inquiry-1", category: "payment" },
      adminPath: "/admin/inquiries/inquiry-1",
    });

    const message = formatOpsEventForTelegram(event, { siteUrl: "https://talktheme.example" });
    expect(message).toContain("문의: inquiry-1");
    expect(message).toContain("문의 분류: payment");
    expect(message).not.toContain("본문");
    expect(message).toContain("관리자 확인: https://talktheme.example/admin/inquiries/inquiry-1");
  });

  it("includes a bounded event ID for issues without an entity", () => {
    const eventId = `runtime.health_failed:${"x".repeat(160)}`;
    const message = formatOpsIssuesForTelegram({
      events: [{
        eventId,
        eventType: "runtime.health_failed",
        severity: "P1",
        occurredAt: "2026-08-30T00:00:00.000Z",
      }],
      inquiries: [],
    });

    expect(message).toContain(`이벤트 ID: ${eventId.slice(0, 79)}…`);
    expect(message).not.toContain(eventId);
  });

  it("labels issue event types in Korean and keeps a 20+20 list inside the Telegram limit", () => {
    const message = formatOpsIssuesForTelegram({
      events: Array.from({ length: 20 }, (_, index) => ({
        eventId: `export.failed:${"a".repeat(36)}:${index}`,
        eventType: "export.failed" as const,
        severity: "P1" as const,
        occurredAt: "2026-10-23T14:05:02.877Z",
        entityKind: "export_job" as const,
        entityId: "b".repeat(36),
      })),
      inquiries: Array.from({ length: 20 }, () => ({ id: "c".repeat(36), status: "open" as const, createdAt: "2026-10-23T14:05:02.877Z" })),
    });

    expect(message).toContain("🚨 [P1] Export 실패 · ");
    expect(message).toContain("10/23(금) 23:05:02 KST");
    // sendTelegramMessage가 3,800자에서 말없이 자른다. 그 전에 끝나고, 무엇을 뺐는지 적어야 한다.
    expect(message.length).toBeLessThan(3_800);
    const shown = (message.match(/^🚨 /gm)?.length ?? 0) + (message.match(/^💬 /gm)?.length ?? 0);
    const omitted = Number(/(\d+)건을 생략했습니다/.exec(message)?.[1] ?? 0);
    expect(omitted).toBeGreaterThan(0);
    expect(shown + omitted).toBe(40);
  });

  it("does not add an omission note when everything fits", () => {
    const message = formatOpsIssuesForTelegram({
      events: [],
      inquiries: [{ id: "inquiry-1", status: "answered", createdAt: "2026-10-23T14:05:02.877Z" }],
    });
    expect(message).toContain("💬 inquiry-1 · 답변함 · 10/23(금) 23:05:02 KST");
    expect(message).not.toContain("생략");
  });

  it("uses Korean terms in the status snapshot", () => {
    const message = formatOpsStatusForTelegram({
      pendingExports: 1, staleExports: 0, pendingNotifications: 2, retryNotifications: 1, deadLetterNotifications: 3,
      openInquiries: 0, billingHolds: 4, lastP1At: null,
    });
    expect(message).toContain("전송 포기 3건");
    expect(message).toContain("결제 보류: 4건");
    expect(message).not.toMatch(/dead-letter|Billing hold/);
  });
});

/**
 * 독립 감시기(`services/runtime-monitor/format.ts`)와 같은 형식이어야 한다. 두 발송처의 알림이 한 채팅에
 * 섞여 오므로, 시각 형식이 다르면 다시 머릿속으로 맞춰 읽어야 한다.
 */
describe("KST 시각 형식", () => {
  it.each([
    ["2026-10-23T14:05:02.877Z", "10/23(금) 23:05:02 KST"],
    // UTC 15시는 KST 다음 날 00시다. 24시로 쓰지 않는다.
    ["2026-10-23T15:00:00.000Z", "10/24(토) 00:00:00 KST"],
    ["2026-12-31T15:30:00.000Z", "01/01(금) 00:30:00 KST"],
  ])("%s → %s", (value, expected) => {
    expect(formatKoreanTime(value)).toBe(expected);
  });

  it("keeps the input for an invalid date", () => {
    expect(formatKoreanTime("not-a-date")).toBe("not-a-date");
  });

  it("is used by the test message", () => {
    expect(formatTelegramTestMessage({ environment: "production", now: new Date("2026-10-23T14:05:02.877Z") }))
      .toContain("발생: 10/23(금) 23:05:02 KST");
  });
});

describe("/exports", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "3f2a8c1d-0000-4000-8000-000000000000",
    created_at: "2026-10-23T14:05:02.877Z",
    platform: "android",
    status: "succeeded",
    stage: "completed",
    error_code: null,
    duration_ms: 42_100,
    referenced_asset_file_count: 36,
    ...overrides,
  });

  it("renders status, platform, duration and referenced files from allowlisted columns", () => {
    const message = formatOpsExportsForTelegram([
      parseOpsRecentExport(row()),
      parseOpsRecentExport(row({ platform: "ios", status: "failed", stage: "packaging", error_code: "build_failed", duration_ms: 192_400, referenced_asset_file_count: 0 })),
      parseOpsRecentExport(row({ status: "pending", stage: "building", duration_ms: null })),
    ]);

    expect(message).toBe([
      "📦 TalkTheme 최근 Export 3건",
      "",
      "✅ 10/23(금) 23:05:02 KST · Android · 성공",
      "   3f2a8c1d · 42.1초 · 참조 36개",
      "❌ 10/23(금) 23:05:02 KST · iOS · 실패 (패키징)",
      "   3f2a8c1d · 3분 12초 · 오류 build_failed",
      "⏳ 10/23(금) 23:05:02 KST · Android · 진행 중 (빌드)",
      "   3f2a8c1d · - · 참조 36개",
    ].join("\n"));
  });

  it("does not let free text through the error code or unknown enum values", () => {
    const parsed = parseOpsRecentExport(row({
      status: "weird\nstatus",
      stage: "https://evil.example/stage",
      platform: "user@example.com",
      error_code: "failed\nsee https://evil.example user@example.com",
    }));
    const message = formatOpsExportsForTelegram([parsed]);

    expect(parsed.errorCode).toBe("unknown");
    expect(message).not.toMatch(/https?:|@|evil|weird/);
    expect(message).toContain("❔");
    expect(message).toContain("알 수 없음");
  });

  it("keeps ten jobs inside the Telegram limit", () => {
    const jobs: OpsRecentExport[] = Array.from({ length: 10 }, () => parseOpsRecentExport(row({
      status: "failed", stage: "finalizing", error_code: "x".repeat(64), duration_ms: 3_599_000,
    })));
    expect(formatOpsExportsForTelegram(jobs).length).toBeLessThan(3_800);
  });

  it("says so when there is nothing to show", () => {
    expect(formatOpsExportsForTelegram([])).toContain("최근 Export가 없습니다.");
  });

  /** 운영 채팅으로 나가는 조회다. 조회 칸이 늘어나면 이 테스트가 먼저 멈춰 세운다. */
  it("selects only the allowlisted columns", () => {
    expect(opsRecentExportColumns.split(",")).toEqual([
      "id", "created_at", "platform", "status", "stage", "error_code", "duration_ms", "referenced_asset_file_count",
    ]);
  });
});

describe("/week", () => {
  const counts = {
    signups: 3, paymentsPaid: 2, paymentsPaidAmount: 9_800, paymentFailures: 1, refundsCount: 0, refundsAmount: 0,
    refundsReviewRequired: 0, exportsSucceeded: 40, exportsFailed: 2, exportsPending: 1, newInquiries: 4, openInquiries: 2,
    p1Issues: 0, p2Issues: 1, deadLetterNotifications: 0,
  };

  it("names the period and separates current values from period totals", () => {
    const message = formatOpsWeekSummaryForTelegram({
      ...counts,
      firstDay: "2026-10-16",
      lastDay: "2026-10-22",
      startAt: "2026-10-15T15:00:00.000Z",
      endAt: "2026-10-22T15:00:00.000Z",
    });

    expect(message).toContain("기간: 10/16(금) ~ 10/22(목) (KST, 오늘 제외)");
    expect(message).toContain("방문자(GA4): 미집계");
    expect(message).toContain("Export: 성공 40건 · 실패 2건\n");
    // 현재 값은 기간 합계 줄에 섞지 않고 "지금 기준" 아래에만 둔다.
    const [period, current] = message.split("지금 기준");
    expect(period).not.toContain("대기");
    expect(period).not.toContain("미종결");
    expect(current).toContain("Export 대기: 1건 · 미종결 문의: 2건");
  });
});
