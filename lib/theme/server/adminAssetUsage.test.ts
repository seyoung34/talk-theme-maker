// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), gt: vi.fn(), read: vi.fn(), annotate: vi.fn((index) => index) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/theme/adminAssetAppliedUsage", () => ({ annotateAdminAssetAppliedUsage: mocks.annotate }));
import { readAdminAssetUsageIndex } from "./adminAssetUsage";
const id = "11111111-2222-4333-8444-555555555555";
const batch = (offset: number) => Array.from({ length: 200 }, (_, n) => ({ id: String(offset + n), platform: "android", upload_refs: { bg: [{ catalog: { assetId: `admin:${id}` } }] }, system_template_bundles: { id: "bundle", title: "Template" } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.read.mockReset();
  const query = { select: () => query, order: () => query, limit: () => query, gt: (column: string, cursor: string) => { mocks.gt(column, cursor); return query; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.read()).then(resolve) };
  const inventory = { select: () => inventory, order: () => inventory, limit: () => Promise.resolve({ data: [{ id }], error: null }) };
  mocks.client.mockReturnValue({ from: (table: string) => table === "admin_assets" ? inventory : query });
});
describe("admin usage server pagination", () => {
  it("keeps already read references when a later page fails", async () => {
    mocks.read.mockReturnValueOnce({ data: batch(0), error: null });
    mocks.read.mockReturnValueOnce({ data: null, error: new Error("offline") });
    const result = await readAdminAssetUsageIndex({ includeApplied: false });
    expect(result.complete).toBe(false);
    expect(result.byAssetId[id][0].variants).toHaveLength(200);
  });
  it("reads beyond 500 rows once and builds one shared index", async () => {
    for (let page = 0; page < 3; page++) mocks.read.mockReturnValueOnce({ data: batch(page * 200), error: null });
    mocks.read.mockReturnValueOnce({ data: [], error: null });
    const result = await readAdminAssetUsageIndex({ includeApplied: false });
    expect(result.complete).toBe(true);
    expect(result.byAssetId[id][0].variants).toHaveLength(600);
    expect(mocks.read).toHaveBeenCalledTimes(4);
    expect(mocks.gt).toHaveBeenNthCalledWith(1, "id", "199");
    expect(mocks.annotate).not.toHaveBeenCalled();
  });
  it("marks the bounded result incomplete", async () => {
    mocks.read.mockReturnValue({ data: batch(0), error: null });
    expect((await readAdminAssetUsageIndex({ includeApplied: false })).complete).toBe(false);
    expect(mocks.read).toHaveBeenCalledTimes(50);
  });
  it("fails instead of hiding query errors as an empty index", async () => {
    mocks.read.mockReturnValue({ data: null, error: new Error("offline") });
    await expect(readAdminAssetUsageIndex()).rejects.toThrow("offline");
  });
});
