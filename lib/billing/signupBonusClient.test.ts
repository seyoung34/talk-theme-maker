import { afterEach, describe, expect, it, vi } from "vitest";
import { claimSignupBonusFromClient, expectedUserIdHeader, SignupBonusSessionChangedError } from "@/lib/billing/signupBonusClient";

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("claimSignupBonusFromClient", () => {
  it("throws session-changed on 401 when an expected user id is supplied (expired session after consent)", async () => {
    const fetchMock = stubFetch(401);
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusSessionChangedError);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ [expectedUserIdHeader]: "u1" });
  });

  it("keeps returning null on 401 for legacy callers without an expected user id", async () => {
    stubFetch(401);
    await expect(claimSignupBonusFromClient()).resolves.toBeNull();
  });

  it("throws session-changed on 409", async () => {
    stubFetch(409);
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusSessionChangedError);
  });

  it("returns the payload on success", async () => {
    stubFetch(200, { granted: true });
    await expect(claimSignupBonusFromClient("u1")).resolves.toEqual({ granted: true });
  });
});
