import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
  createAdminClient: vi.fn(),
}));

import { POST } from "@/app/api/credits/signup-bonus/route";
import { getCurrentUserOrNull } from "@/lib/billing/credits";

const post = () => POST(new Request("http://localhost/api/credits/signup-bonus", { method: "POST", headers: { "x-expected-user-id": "u1" } }));

describe("POST /api/credits/signup-bonus auth error mapping (real supabase-js error types)", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ campaign_key: "signup_bonus_v1", credits_granted: 1, balance: 1, already_claimed: false }], error: null });
  });

  it.each([
    ["missing session", new AuthSessionMissingError()],
    ["invalid/expired JWT", new AuthApiError("invalid JWT", 401, "bad_jwt")],
  ])("returns 401 for %s", async (_name, error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    const response = await post();
    expect(response.status).toBe(401);
    expect((await response.json()).reason).toBe("unauthenticated");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["network failure", new AuthRetryableFetchError("fetch failed", 0)],
    ["auth server 5xx", new AuthApiError("upstream", 503, "unexpected_failure")],
  ])("returns 503 auth_unavailable for %s without claiming", async (_name, error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("auth_unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("claims for an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    expect((await post()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps getCurrentUserOrNull returning null for both missing and transient errors (other callers unchanged)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("down", 0) });
    await expect(getCurrentUserOrNull()).resolves.toBeNull();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(getCurrentUserOrNull()).resolves.toBeNull();
  });
});
