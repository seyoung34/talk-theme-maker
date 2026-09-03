import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/ops/daily-summary/route";

const mocks = vi.hoisted(() => ({
  authorizeOpsInternalRequest: vi.fn(),
  createOpsDailySummaryEvent: vi.fn(),
  drainTelegramNotifications: vi.fn(),
  tryPublishOpsEvent: vi.fn(),
  getPreviousOpsDay: vi.fn(),
  readOpsDailySummary: vi.fn(),
}));

vi.mock("@/lib/ops/internalAuth", () => ({
  authorizeOpsInternalRequest: mocks.authorizeOpsInternalRequest,
}));

vi.mock("@/lib/ops/eventFactories", () => ({
  createOpsDailySummaryEvent: mocks.createOpsDailySummaryEvent,
}));

vi.mock("@/lib/ops/dispatcher", () => ({
  drainTelegramNotifications: mocks.drainTelegramNotifications,
  tryPublishOpsEvent: mocks.tryPublishOpsEvent,
}));

vi.mock("@/lib/ops/dailySummary", () => ({
  getPreviousOpsDay: mocks.getPreviousOpsDay,
  readOpsDailySummary: mocks.readOpsDailySummary,
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
  mocks.createOpsDailySummaryEvent.mockReset().mockReturnValue({ eventId: "daily-event" });
  mocks.tryPublishOpsEvent.mockReset().mockResolvedValue({
    status: "inserted",
    drainResult: { status: "drained", claimed: 1, sent: 1, retried: 0, deadLettered: 0 },
  });
  mocks.drainTelegramNotifications.mockReset().mockResolvedValue({
    status: "drained", claimed: 1, sent: 1, retried: 0, deadLettered: 0,
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
    expect(mocks.drainTelegramNotifications).not.toHaveBeenCalled();
  });

  it("drains existing delivery work when the date event is already present", async () => {
    mocks.tryPublishOpsEvent.mockResolvedValueOnce({ status: "duplicate" });

    const response = await POST(new Request("https://talktheme.test/api/internal/ops/daily-summary?date=2026-09-01", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.readOpsDailySummary).toHaveBeenCalledWith("2026-09-01");
    expect(mocks.drainTelegramNotifications).toHaveBeenCalledWith({ limit: 20 });
  });

  it("does not run without the internal scheduler token", async () => {
    mocks.authorizeOpsInternalRequest.mockReturnValueOnce({ ok: false, reason: "unauthorized" });

    const response = await POST(new Request("https://talktheme.test/api/internal/ops/daily-summary", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.readOpsDailySummary).not.toHaveBeenCalled();
  });
});
