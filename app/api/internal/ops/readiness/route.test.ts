import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), select: vi.fn(), limit: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.create }));
import { GET } from "./route";
const token = "r".repeat(32);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MONITOR_READINESS_TOKEN", token);
  mocks.create.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "Bearer wrong", "Bearer " + "한".repeat(32)])("unauthorized request does not access DB", async authorization => {
  const response = await GET(new Request("https://site.test", { headers: authorization ? { authorization } : {} }));
  expect(response.status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("unconfigured endpoint is unavailable and never touches DB", async () => {
  vi.stubEnv("MONITOR_READINESS_TOKEN", "");
  expect((await GET(new Request("https://site.test"))).status).toBe(503);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("authenticated readiness performs a bounded HEAD read and exposes no rows", async () => {
  const response = await GET(new Request("https://site.test", { headers: { authorization: "Bearer " + token } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ready: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.from).toHaveBeenCalledWith("export_jobs");
  expect(mocks.select).toHaveBeenCalledWith("id", { head: true });
  expect(mocks.limit).toHaveBeenCalledWith(1);
  expect(mocks.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
});
it.each(["returned", "thrown"] as const)("DB %s failure is unavailable without provider details", async kind => {
  const error = new Error("private-database-url-token");
  if (kind === "returned") mocks.abortSignal.mockResolvedValue({ error });
  else mocks.abortSignal.mockRejectedValue(error);
  const response = await GET(new Request("https://site.test", { headers: { authorization: "Bearer " + token } }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ready: false, reason: "database_unavailable" });
});
