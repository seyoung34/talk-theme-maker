import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), claim: vi.fn() }));

vi.mock("@/lib/billing/credits", () => ({
  getCurrentUserOrNull: mocks.getUser,
  claimSignupBonusForCurrentUser: mocks.claim,
  isSignupBonusUnavailableError: () => false,
  signupBonusCampaignKey: "signup_bonus_v1",
}));

import { POST } from "@/app/api/credits/signup-bonus/route";

const post = (headers?: Record<string, string>) =>
  POST(new Request("http://localhost/api/credits/signup-bonus", { method: "POST", headers }));

describe("POST /api/credits/signup-bonus", () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ id: "u1" });
    mocks.claim.mockReset().mockResolvedValue({ campaignKey: "signup_bonus_v1", creditsGranted: 1, balance: 1, alreadyClaimed: false });
  });

  it("rejects without claiming when the expected user differs from the session user", async () => {
    const response = await post({ "x-expected-user-id": "other" });
    expect(response.status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims when the expected user matches or no expectation is sent", async () => {
    expect((await post({ "x-expected-user-id": "u1" })).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledTimes(2);
  });
});
