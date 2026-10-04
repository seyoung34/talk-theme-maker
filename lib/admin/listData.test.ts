import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAdminInquiries, listAdminNotices, listAdminGrantCodes, loadAdminMarketingReport } from "./listData";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => mocks }));
beforeEach(() => vi.clearAllMocks());

describe("shared authorized list loaders", () => {
  it("uses the same open/all inquiry filter and preserves read errors", async () => {
    const query = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), then: vi.fn() };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.then.mockImplementation((resolve) => Promise.resolve({ data: [], error: null }).then(resolve));
    mocks.from.mockReturnValue(query);
    expect(await listAdminInquiries("open")).toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("status", "open");
    query.eq.mockClear();
    await listAdminInquiries();
    expect(query.eq).not.toHaveBeenCalled();
    query.then.mockImplementation((resolve) => Promise.resolve({ data: null, error: new Error("lookup failed") }).then(resolve));
    await expect(listAdminInquiries()).rejects.toThrow("lookup failed");
    await expect(listAdminNotices()).rejects.toThrow("lookup failed");
    await expect(listAdminGrantCodes()).rejects.toThrow("lookup failed");
  });
  it("keeps marketing aggregation in SQL and fails when either RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const report = await loadAdminMarketingReport();
    expect(report).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith("marketing_weekly_summary", { p_weeks: 8 });
    expect(mocks.rpc).toHaveBeenCalledWith("marketing_weekly_clicks", { p_weeks: 8 });
    mocks.rpc.mockImplementation(async (name) => ({ data: [], error: name.endsWith("clicks") ? new Error("clicks failed") : null }));
    await expect(loadAdminMarketingReport()).rejects.toThrow("clicks failed");
  });
});
