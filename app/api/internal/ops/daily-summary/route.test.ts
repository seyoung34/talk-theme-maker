import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/ops/daily-summary/route";

const mocks = vi.hoisted(() => ({
  authorizeOpsInternalRequest: vi.fn(),
  createOpsDailySummaryEvent: vi.fn(),
  tryPublishOpsEvent: vi.fn(),
  getPreviousOpsDay: vi.fn(),
  readOpsDailySummary: vi.fn(),
  validateCompletedOpsDay: vi.fn(),
}));

vi.mock("@/lib/ops/internalAuth", () => ({
  authorizeOpsInternalRequest: mocks.authorizeOpsInternalRequest,
}));

vi.mock("@/lib/ops/eventFactories", () => ({
  createOpsDailySummaryEvent: mocks.createOpsDailySummaryEvent,
}));

vi.mock("@/lib/ops/dispatcher", () => ({
  tryPublishOpsEvent: mocks.tryPublishOpsEvent,
}));

vi.mock("@/lib/ops/dailySummary", () => ({
  getPreviousOpsDay: mocks.getPreviousOpsDay,
  readOpsDailySummary: mocks.readOpsDailySummary,
  validateCompletedOpsDay: mocks.validateCompletedOpsDay,
}));

const summary = {
  day: "2026-09-02",
  startAt: "2026-09-01T15:00:00.000Z",
  endAt: "2026-09-02T15:00:00.000Z",
  signups: 0,
  paymentsPaid: 0,
  paymentsPaidAmount: 0,
  paymentFailures: 0,
  refundsCount: 0,
  refundsAmount: 0,
  refundsReviewRequired: 0,
  exportsSucceeded: 0,
  exportsFailed: 0,
  exportsPending: 0,
  newInquiries: 0,
  openInquiries: 0,
  p1Issues: 0,
  p2Issues: 0,
  deadLetterNotifications: 0,
  visitors: { status: "not_configured" as const, visitors: null, sessions: null, newUsers: null },
};

beforeEach(() => {
  mocks.authorizeOpsInternalRequest.mockReset().mockReturnValue({ ok: true });
  mocks.getPreviousOpsDay.mockReset().mockReturnValue("2026-09-02");
  mocks.readOpsDailySummary.mockReset().mockResolvedValue(summary);
  mocks.validateCompletedOpsDay.mockReset().mockImplementation((day: string) => ({ ok: true, day }));
  mocks.createOpsDailySummaryEvent.mockReset().mockReturnValue({ eventId: "daily-event" });
  mocks.tryPublishOpsEvent.mockReset().mockResolvedValue({
    status: "inserted",
    drainResult: { status: "drained", claimed: 1, sent: 1, retried: 0, deadLettered: 0 },
  });
});

describe("daily operations summary route", () => {
  it("uses the previous KST day by default and publishes one deterministic event", async () => {
    const response = await POST(new Request("https://talktheme.test/api/internal/ops/daily-summary", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      day: "2026-09-02",
      notification: { status: "inserted" },
    });
    expect(mocks.readOpsDailySummary).toHaveBeenCalledWith("2026-09-02");
    expect(mocks.createOpsDailySummaryEvent).toHaveBeenCalledWith(summary);
  });

  it("drains existing delivery work when the date event is already present", async () => {
    mocks.tryPublishOpsEvent.mockResolvedValueOnce({
      status: "duplicate",
      requeued: true,
      drainResult: { status: "drained", claimed: 1, sent: 1, retried: 0, deadLettered: 0 },
    });

    const response = await POST(new Request("https://talktheme.test/api/internal/ops/daily-summary?date=2026-09-01", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.readOpsDailySummary).toHaveBeenCalledWith("2026-09-01");
    await expect(response.json()).resolves.toMatchObject({
      notification: { status: "duplicate", requeued: true, drain: { sent: 1 } },
    });
  });

  it("returns 400 for an invalid calendar date without creating an event", async () => {
    mocks.validateCompletedOpsDay.mockReturnValueOnce({ ok: false, reason: "invalid_date" });

    const response = await POST(new Request(
      "https://talktheme.test/api/internal/ops/daily-summary?date=2026-02-30",
      { method: "POST" },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: "invalid_date" });
    expect(mocks.readOpsDailySummary).not.toHaveBeenCalled();
  });

  it("returns 400 for today or a future date because the KST day is not closed", async () => {
    mocks.validateCompletedOpsDay.mockReturnValueOnce({ ok: false, reason: "date_not_closed" });

    const response = await POST(new Request(
      "https://talktheme.test/api/internal/ops/daily-summary?date=2026-09-03",
      { method: "POST" },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ reason: "date_not_closed" });
    expect(mocks.readOpsDailySummary).not.toHaveBeenCalled();
  });

  it("does not run without the internal scheduler token", async () => {
    mocks.authorizeOpsInternalRequest.mockReturnValueOnce({ ok: false, reason: "unauthorized" });

    const response = await POST(new Request("https://talktheme.test/api/internal/ops/daily-summary", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.readOpsDailySummary).not.toHaveBeenCalled();
  });
});
