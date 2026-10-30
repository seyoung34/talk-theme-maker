import { afterEach, describe, expect, it, vi } from "vitest";
import { claimSignupBonusFromClient, expectedUserIdHeader, SignupBonusAuthUnavailableError, SignupBonusSessionChangedError } from "@/lib/billing/signupBonusClient";

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

  it("throws auth-unavailable on 503 only when an expected user id is supplied", async () => {
    stubFetch(503, { reason: "auth_unavailable" });
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusAuthUnavailableError);
    stubFetch(503, { error: "x" });
    await expect(claimSignupBonusFromClient()).rejects.not.toBeInstanceOf(SignupBonusAuthUnavailableError);
  });

  it.each([429, 500, 502])("throws auth-unavailable on %i when an expected user id is supplied", async (status) => {
    stubFetch(status, { error: "x" });
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusAuthUnavailableError);
  });

  it("throws auth-unavailable when fetch rejects or the body is unreadable, only with an expected user id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusAuthUnavailableError);
    await expect(claimSignupBonusFromClient()).rejects.toBeInstanceOf(TypeError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusAuthUnavailableError);
  });

  it("keeps the generic error for legacy callers on 500", async () => {
    stubFetch(500, { error: "x" });
    await expect(claimSignupBonusFromClient()).rejects.not.toBeInstanceOf(SignupBonusAuthUnavailableError);
  });

  const validClaim = { campaignKey: "signup_bonus_v1", creditsGranted: 1, balance: 1, alreadyClaimed: false, granted: true };

  it("returns the payload on a valid route response", async () => {
    stubFetch(200, validClaim);
    await expect(claimSignupBonusFromClient("u1")).resolves.toEqual(validClaim);
  });

  it("accepts the route's bonus-unavailable 200 (granted false with a reason)", async () => {
    const unavailable = { campaignKey: "signup_bonus_v1", creditsGranted: 0, alreadyClaimed: false, granted: false, reason: "campaign_ended" };
    stubFetch(200, unavailable);
    await expect(claimSignupBonusFromClient("u1")).resolves.toEqual(unavailable);
  });

  it.each([
    ["empty JSON", () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })],
    ["JSON null", () => new Response("null", { status: 200, headers: { "Content-Type": "application/json" } })],
    ["wrong field types", () => new Response(JSON.stringify({ ...validClaim, granted: "yes" }), { status: 200, headers: { "Content-Type": "application/json" } })],
    ["error body", () => new Response(JSON.stringify({ ...validClaim, error: "x" }), { status: 200, headers: { "Content-Type": "application/json" } })],
    ["HTML", () => new Response("<html>ok</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["HTML labelled JSON", () => new Response("<html>", { status: 200, headers: { "Content-Type": "application/json" } })],
    ["204", () => new Response(null, { status: 204 })],
  ])("treats a malformed 2xx (%s) as retryable with an expected user id", async (_name, make) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make()));
    await expect(claimSignupBonusFromClient("u1")).rejects.toBeInstanceOf(SignupBonusAuthUnavailableError);
  });

  it("keeps legacy callers lenient about the success body", async () => {
    stubFetch(200, { granted: true });
    await expect(claimSignupBonusFromClient()).resolves.toEqual({ granted: true });
  });
});
