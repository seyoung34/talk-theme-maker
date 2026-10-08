import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), settle: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/ops/internalAuth", () => ({ authorizeOpsInternalRequest: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/theme/export/asyncExportStatus", () => ({ resolveExportSettlement: mocks.settle }));

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ ok: true }); });

describe("export sweep", () => {
  it("rejects unauthenticated requests before database access", async () => {
    mocks.auth.mockReturnValue({ ok: false, reason: "unauthorized" });
    expect((await POST(new Request("https://internal", { method: "POST" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rotates failing and pending jobs so subsequent ticks reach later jobs", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({ id: `job-${i}`, user_id: `user-${i}`, platform: "android", updated: i }));
    let tick = 10;
    const orders: string[] = [];
    mocks.from.mockImplementation(() => {
      let id: string | undefined;
      let updating = false;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
        order: (column: string) => { orders.push(column); return query; },
        limit: (count: number) => Promise.resolve({ data: [...jobs].sort((a, b) => a.updated - b.updated).slice(0, count), error: null }),
        update: () => { updating = true; return query; },
        maybeSingle: async () => {
          const row = jobs.find((job) => job.id === id);
          if (row && updating) row.updated = tick++;
          return { data: row ? { id: row.id } : null, error: null };
        },
      };
      return query;
    });
    mocks.settle.mockImplementation(async (_user: string, id: string) => {
      if (id === "job-0") throw new Error("lookup failed");
      return { kind: "pending", stage: "building" };
    });
    const response = await POST(new Request("https://internal", { method: "POST" }));
    expect(await response.json()).toMatchObject({ scanned: 2, failed: 1, stillPending: 1, truncated: true });
    await POST(new Request("https://internal", { method: "POST" }));
    await POST(new Request("https://internal", { method: "POST" }));
    expect(mocks.settle.mock.calls.slice(0, 5).map((call) => call[1])).toEqual(["job-0", "job-1", "job-2", "job-3", "job-4"]);
    expect(mocks.settle).toHaveBeenCalledWith("user-0", "job-0", "android", { executionLookupPages: 5 });
    expect(orders.slice(0, 3)).toEqual(["updated_at", "created_at", "id"]);
  });

  it("skips a concurrent settlement and never resolves a failed rotation", async () => {
    let updates = 0;
    const query = {
      select: () => query, eq: () => query, order: () => query,
      limit: async () => ({ data: [{ id: "one", user_id: "user", platform: "ios" }, { id: "two", user_id: "user", platform: "ios" }], error: null }),
      update: () => query,
      maybeSingle: async () => ++updates === 1 ? { data: null, error: null } : { data: null, error: new Error("write failed") },
    };
    mocks.from.mockReturnValue(query);
    const response = await POST(new Request("https://internal", { method: "POST" }));
    expect(await response.json()).toMatchObject({ skipped: 1, failed: 1, terminal: 0 });
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
