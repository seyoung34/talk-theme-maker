import { beforeEach, expect, it, vi } from "vitest";
import type { OpsDailySummaryCounts } from "@/lib/ops/repository";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), inquiries: vi.fn(), refunds: vi.fn(), events: vi.fn(), day: vi.fn() }));
vi.mock("@/lib/admin/consoleBadges", () => ({ getAdminOpsStatusSnapshot: mocks.snapshot, countOpenInquiries: mocks.inquiries }));
vi.mock("@/lib/ops/repository", () => ({ listRecentOpsEvents: mocks.events, getOpsDailySummary: mocks.day }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: mocks.refunds }) }) }) }));
import { startAdminOverview } from "./loadOverview";

const day: OpsDailySummaryCounts = {
  signups: 4, paymentsPaid: 1, paymentsPaidAmount: 1000, paymentFailures: 0,
  refundsCount: 0, refundsAmount: 0, refundsReviewRequired: 0,
  exportsSucceeded: 2, exportsFailed: 0, exportsPending: 1,
  newInquiries: 1, openInquiries: 3, p1Issues: 0, p2Issues: 0, deadLetterNotifications: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.snapshot.mockResolvedValue({ staleExports: 1, billingHolds: 0, deadLetterNotifications: 0 });
  mocks.inquiries.mockResolvedValue(3);
  mocks.refunds.mockResolvedValue({ count: 0, error: null });
  mocks.events.mockResolvedValue([]);
  mocks.day.mockResolvedValue(day);
});

it("starts every lookup together but resolves attention and issues without waiting for history", async () => {
  let finish!: (value: OpsDailySummaryCounts) => void;
  const delayed = new Promise<OpsDailySummaryCounts>((resolve) => { finish = resolve; });
  mocks.day.mockReturnValue(delayed);
  const sections = startAdminOverview(new Date("2026-10-04T12:00:00Z"));
  expect(mocks.day).toHaveBeenCalledTimes(7);
  expect(mocks.events).toHaveBeenCalledWith({ limit: 6 });
  expect((await sections.attention).find((card) => card.id === "open-inquiries")?.value).toBe("3");
  expect(await sections.issues).toEqual({ ok: true, value: [] });
  finish(day);
  expect((await sections.activity).history).toHaveLength(7);
});

it("keeps lookup failure distinct from zero in independently loaded sections", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.snapshot.mockRejectedValue(new Error("snapshot unavailable"));
  mocks.events.mockRejectedValue(new Error("events unavailable"));
  mocks.day.mockRejectedValueOnce(new Error("one day unavailable"));
  const sections = startAdminOverview(new Date("2026-10-04T12:00:00Z"));
  expect((await sections.attention).find((card) => card.id === "stale-exports")).toMatchObject({ unavailable: true, value: undefined });
  expect(await sections.issues).toEqual({ ok: false });
  const activity = await sections.activity;
  expect(activity.history[0]?.counts).toBeUndefined();
  expect(activity.today.find((card) => card.id === "signups")?.value).toBe("4");
  warning.mockRestore();
});
