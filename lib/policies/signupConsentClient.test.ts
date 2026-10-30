import { afterEach, describe, expect, it, vi } from "vitest";
import { recordSignupConsentFromClient, SignupConsentSessionChangedError, SignupConsentVersionChangedError } from "@/lib/policies/signupConsentClient";

const json = { "Content-Type": "application/json" };

function stub(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("recordSignupConsentFromClient", () => {
  it("resolves only when the server confirms recorded:true", async () => {
    const fetchMock = stub(new Response(JSON.stringify({ recorded: true }), { status: 200, headers: json }));
    await expect(recordSignupConsentFromClient("u1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["204 without body", () => new Response(null, { status: 204 })],
    ["empty JSON", () => new Response("{}", { status: 200, headers: json })],
    ["recorded:false", () => new Response(JSON.stringify({ recorded: false }), { status: 200, headers: json })],
    ["recorded as string", () => new Response(JSON.stringify({ recorded: "true" }), { status: 200, headers: json })],
    ["JSON null", () => new Response("null", { status: 200, headers: json })],
    ["HTML fallback page", () => new Response("<html>ok</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
  ])("rejects a 2xx that does not confirm the record (%s)", async (_name, make) => {
    stub(make());
    await expect(recordSignupConsentFromClient("u1")).rejects.toThrow("consent_record_unconfirmed");
  });

  it("keeps the existing error mapping for failures", async () => {
    stub(new Response(JSON.stringify({ reason: "policy_version_changed" }), { status: 409, headers: json }));
    await expect(recordSignupConsentFromClient("u1")).rejects.toBeInstanceOf(SignupConsentVersionChangedError);
    stub(new Response("{}", { status: 401, headers: json }));
    await expect(recordSignupConsentFromClient("u1")).rejects.toBeInstanceOf(SignupConsentSessionChangedError);
    stub(new Response("{}", { status: 500, headers: json }));
    await expect(recordSignupConsentFromClient("u1")).rejects.toThrow("consent_record_failed");
  });
});
