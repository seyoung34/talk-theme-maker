import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentAdmin: mocks.auth }));
vi.mock("@/lib/theme/server/adminAssetUsage", () => ({ readAdminAssetUsageIndex: mocks.read }));
import { GET } from "./route";

beforeEach(() => { vi.resetAllMocks(); });
describe("admin usage route", () => {
  it("rejects unauthenticated requests before reading", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: null });
    expect((await GET()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects non-admin users before reading", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: { id: "user" }, profile: null });
    expect((await GET()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns partial results explicitly with private no-store", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: { id: "admin" }, profile: {} });
    mocks.read.mockResolvedValue({ byAssetId: {}, complete: false, unknownReferences: 1, checkedAt: "now" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).complete).toBe(false);
  });
  it("does not return an empty success on lookup failure", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: { id: "admin" }, profile: {} });
    mocks.read.mockRejectedValue(new Error("provider detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await GET();
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("provider detail");
    } finally { log.mockRestore(); }
  });
});
