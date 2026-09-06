import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOpsCommandReply, parseOpsTelegramCommand } from "@/lib/ops/commands";

const mocks = vi.hoisted(() => ({
  getGa4VisitorConfigStatus: vi.fn(),
  getOpsStatusSnapshot: vi.fn(),
  listRecentOpsIssues: vi.fn(),
  readOpsDailySummary: vi.fn(),
  getCurrentOpsDay: vi.fn(),
  getPreviousOpsDay: vi.fn(),
}));

vi.mock("@/lib/analytics/ga4DataApi", () => ({
  getGa4VisitorConfigStatus: mocks.getGa4VisitorConfigStatus,
}));

vi.mock("@/lib/ops/repository", () => ({
  getOpsStatusSnapshot: mocks.getOpsStatusSnapshot,
  listRecentOpsIssues: mocks.listRecentOpsIssues,
}));

vi.mock("@/lib/ops/dailySummary", () => ({
  readOpsDailySummary: mocks.readOpsDailySummary,
  getCurrentOpsDay: mocks.getCurrentOpsDay,
  getPreviousOpsDay: mocks.getPreviousOpsDay,
}));

const summary = {
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

const status = {
  pendingExports: 1,
  staleExports: 0,
  pendingNotifications: 0,
  retryNotifications: 0,
  deadLetterNotifications: 0,
  openInquiries: 1,
  billingHolds: 0,
  lastP1At: null,
};

beforeEach(() => {
  mocks.getGa4VisitorConfigStatus.mockReset().mockReturnValue("configured");
  mocks.getOpsStatusSnapshot.mockReset().mockResolvedValue(status);
  mocks.listRecentOpsIssues.mockReset().mockResolvedValue({ events: [], inquiries: [] });
  mocks.readOpsDailySummary.mockReset().mockResolvedValue(summary);
  mocks.getCurrentOpsDay.mockReset().mockReturnValue("2026-09-03");
  mocks.getPreviousOpsDay.mockReset().mockReturnValue("2026-09-02");
});

describe("Telegram operator commands", () => {
  it("parses command mentions and keeps arguments separate", () => {
    expect(parseOpsTelegramCommand("/today@talktheme_ops_bot")).toEqual({ name: "today", args: [] });
    expect(parseOpsTelegramCommand("/issues extra words")).toEqual({ name: "issues", args: ["extra", "words"] });
    expect(parseOpsTelegramCommand("status")).toBeNull();
    expect(parseOpsTelegramCommand("/unknown")).toEqual({ name: "unknown", args: [] });
  });

  it("returns a read-only daily report for today", async () => {
    await expect(getOpsCommandReply({ name: "today", args: [] })).resolves.toContain("오늘 운영 현황");
    expect(mocks.readOpsDailySummary).toHaveBeenCalledWith("2026-09-03");
  });

  it("does not execute a command that contains arguments", async () => {
    await expect(getOpsCommandReply({ name: "status", args: ["retry"] })).resolves.toContain("인자가 없는 읽기 전용 명령입니다");
    expect(mocks.getOpsStatusSnapshot).not.toHaveBeenCalled();
  });

  it("reports health without exposing operational payloads", async () => {
    const reply = await getOpsCommandReply({ name: "health", args: [] }, { telegramStatus: "configured" });
    expect(reply).toContain("DB: 정상");
    expect(reply).toContain("GA4 방문자 API: 설정됨");
    expect(reply).not.toContain("email");
  });
});
