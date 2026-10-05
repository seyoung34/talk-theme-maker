import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), events: vi.fn(), inquiries: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { listRecentOpsEvents, listRecentOpsIssues } from "./repository";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.mockResolvedValue({ data: [], error: null });
  mocks.inquiries.mockResolvedValue({ data: [], error: null });
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ in: () => ({ order: () => ({ limit: table === "ops_events" ? mocks.events : mocks.inquiries }) }) }) }));
});

it("overview events do not query inquiries or depend on inquiry availability", async () => {
  mocks.inquiries.mockRejectedValue(new Error("unavailable"));
  await expect(listRecentOpsEvents({ limit: 6 })).resolves.toEqual([]);
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("ops_events");
  expect(mocks.inquiries).not.toHaveBeenCalled();
});

it("Telegram still receives both events and inquiries with its requested limit", async () => {
  await expect(listRecentOpsIssues({ limit: 8 })).resolves.toEqual({ events: [], inquiries: [] });
  expect(mocks.from).toHaveBeenCalledWith("inquiries");
  expect(mocks.events).toHaveBeenCalledWith(8);
  expect(mocks.inquiries).toHaveBeenCalledWith(8);
});

it("a failed event query propagates instead of becoming an empty list", async () => {
  mocks.events.mockResolvedValue({ data: null, error: new Error("events unavailable") });
  await expect(listRecentOpsEvents()).rejects.toThrow("events unavailable");
});
