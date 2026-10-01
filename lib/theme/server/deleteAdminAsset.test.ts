// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ usage: vi.fn(), client: vi.fn(), read: vi.fn(), removeRow: vi.fn(), removeStorage: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./adminAssetUsage", () => ({ readAdminAssetUsageIndex: mocks.usage }));
import { deleteUnreferencedAdminAsset } from "./deleteAdminAsset";
const id = "11111111-2222-4333-8444-555555555555";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.usage.mockResolvedValue({ byAssetId: {}, complete: true });
  mocks.read.mockResolvedValue({ data: { storage_path: `admin-assets/${id}/old.png` }, error: null });
  mocks.removeRow.mockResolvedValue({ error: null });
  mocks.removeStorage.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }), delete: () => ({ eq: mocks.removeRow }) }), storage: { from: () => ({ remove: mocks.removeStorage }) } });
});
describe("delete unreferenced admin asset", () => {
  it("never mutates linked assets", async () => {
    mocks.usage.mockResolvedValue({ byAssetId: { [id]: [{}] }, complete: true });
    expect(await deleteUnreferencedAdminAsset(id)).toBe("linked");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("never mutates if the reverse index is incomplete", async () => {
    mocks.usage.mockResolvedValue({ byAssetId: {}, complete: false });
    expect(await deleteUnreferencedAdminAsset(id)).toBe("incomplete");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("never mutates if lookup throws", async () => {
    mocks.usage.mockRejectedValue(new Error("offline"));
    await expect(deleteUnreferencedAdminAsset(id)).rejects.toThrow("offline");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("cleans up originals only after an unlinked row is deleted", async () => {
    expect(await deleteUnreferencedAdminAsset(id)).toBe("deleted");
    expect(mocks.removeStorage).toHaveBeenCalledWith([`admin-assets/${id}/old.png`]);
  });
  it("preserves originals if row deletion fails", async () => {
    mocks.removeRow.mockResolvedValue({ error: new Error("RLS") });
    await expect(deleteUnreferencedAdminAsset(id)).rejects.toThrow("RLS");
    expect(mocks.removeStorage).not.toHaveBeenCalled();
  });
});
