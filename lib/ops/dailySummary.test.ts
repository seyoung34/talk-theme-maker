import { describe, expect, it, vi } from "vitest";
import {
  getCurrentOpsDay,
  getOpsDayRange,
  getPreviousOpsDay,
  readOpsDailySummary,
  validateCompletedOpsDay,
} from "@/lib/ops/dailySummary";

const mocks = vi.hoisted(() => ({
  getOpsDailySummary: vi.fn(),
  readGa4DailyVisitors: vi.fn(),
}));

vi.mock("@/lib/ops/repository", () => ({
  getOpsDailySummary: mocks.getOpsDailySummary,
}));

vi.mock("@/lib/analytics/ga4DataApi", () => ({
  readGa4DailyVisitors: mocks.readGa4DailyVisitors,
}));

describe("operations day boundaries", () => {
  it("builds half-open UTC boundaries for a KST calendar day", () => {
    expect(getOpsDayRange("2026-09-03")).toEqual({
      day: "2026-09-03",
      startAt: "2026-09-02T15:00:00.000Z",
      endAt: "2026-09-03T15:00:00.000Z",
    });
  });

  it("selects today and yesterday using KST rather than the server locale", () => {
    const now = new Date("2026-09-03T00:30:00.000Z");
    expect(getCurrentOpsDay(now)).toBe("2026-09-03");
    expect(getPreviousOpsDay(now)).toBe("2026-09-02");
  });

  it("combines database counts and optional GA4 metrics", async () => {
    mocks.getOpsDailySummary.mockResolvedValueOnce({
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
    });
    mocks.readGa4DailyVisitors.mockResolvedValueOnce({ status: "ok", visitors: 8, sessions: 10, newUsers: 4 });

    await expect(readOpsDailySummary("2026-09-02")).resolves.toMatchObject({
      day: "2026-09-02",
      startAt: "2026-09-01T15:00:00.000Z",
      endAt: "2026-09-02T15:00:00.000Z",
      signups: 2,
      visitors: { status: "ok", visitors: 8, sessions: 10, newUsers: 4 },
    });
    expect(mocks.getOpsDailySummary).toHaveBeenCalledWith({
      startAt: "2026-09-01T15:00:00.000Z",
      endAt: "2026-09-02T15:00:00.000Z",
    });
    expect(mocks.readGa4DailyVisitors).toHaveBeenCalledWith("2026-09-02");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => getOpsDayRange("2026-02-30")).toThrow("invalid_ops_day");
  });

  it("allows only calendar days that ended before the current KST day", () => {
    const now = new Date("2026-09-03T00:30:00.000Z");

    expect(validateCompletedOpsDay("2026-02-30", now)).toEqual({ ok: false, reason: "invalid_date" });
    expect(validateCompletedOpsDay("2026-09-03", now)).toEqual({ ok: false, reason: "date_not_closed" });
    expect(validateCompletedOpsDay("2026-09-04", now)).toEqual({ ok: false, reason: "date_not_closed" });
    expect(validateCompletedOpsDay("2026-09-02", now)).toEqual({ ok: true, day: "2026-09-02" });
  });
});
