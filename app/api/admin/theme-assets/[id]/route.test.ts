import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ getCurrentAdmin: mocks.auth }));
vi.mock("@/lib/theme/server/deleteAdminAsset", () => ({ deleteUnreferencedAdminAsset: mocks.remove }));
import { DELETE } from "./route";
const id = "11111111-2222-4333-8444-555555555555";
const call = (value = id) => DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: value }) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ configured: true, user: {}, profile: {} }); });
describe("guarded admin asset deletion", () => {
  it("requires login before domain work", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: null });
    expect((await call()).status).toBe(401); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("requires admin before domain work", async () => {
    mocks.auth.mockResolvedValue({ configured: true, user: {}, profile: null });
    expect((await call()).status).toBe(403); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects malformed asset IDs", async () => {
    expect((await call("bad")).status).toBe(400); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([["linked", 409], ["incomplete", 503], ["missing", 404], ["deleted", 204]] as const)("returns %s as %s", async (result, status) => {
    mocks.remove.mockResolvedValue(result); expect((await call()).status).toBe(status);
  });
});
