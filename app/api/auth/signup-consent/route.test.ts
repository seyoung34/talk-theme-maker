import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/policies/signupConsentServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/policies/signupConsentServer")>()),
  recordEmailSignupConsentForUser: mocks.record,
}));

import { currentSignupConsentAcceptance } from "@/lib/policies/signupConsentServer";
import { POST } from "@/app/api/auth/signup-consent/route";

const id = "11111111-1111-4111-8111-111111111111";
// happy-dom의 Request는 origin 같은 금지 헤더를 지우므로 헤더 조회만 흉내 낸 요청을 쓴다.
const noBody = Symbol("noBody");
const post = (headers: Record<string, string> = {}, body: unknown = currentSignupConsentAcceptance()) =>
  POST({ url: "http://localhost/api/auth/signup-consent", headers: { get: (name: string) => headers[name] ?? null }, json: async () => { if (body === noBody) throw new Error("no body"); return body; } } as unknown as Request);

describe("POST /api/auth/signup-consent", () => {
  beforeEach(() => { mocks.record.mockReset(); });

  it("requires a well-formed expected user id", async () => {
    expect((await post()).status).toBe(400);
    expect((await post({ "x-expected-user-id": "nope" })).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests", async () => {
    expect((await post({ "x-expected-user-id": id, origin: "https://evil.example" })).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("ignores the Host header fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect((await post({ "x-expected-user-id": id, origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })).status).toBe(403);
    } finally { vi.unstubAllEnvs(); }
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("accepts an origin matching the Host header when request.url was normalized (non-production)", async () => {
    mocks.record.mockResolvedValue({ status: "recorded" });
    expect((await post({ "x-expected-user-id": id, origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })).status).toBe(200);
    expect((await post({ "x-expected-user-id": id, origin: "http://evil.example", host: "127.0.0.1:3000" })).status).toBe(403);
    expect((await post({ "x-expected-user-id": id, origin: "https://127.0.0.1:3000", host: "127.0.0.1:3000" })).status).toBe(403);
  });

  it("never records without an explicit body, even with a valid session user header (forged marker / direct call)", async () => {
    expect((await post({ "x-expected-user-id": id }, noBody)).status).toBe(400);
    expect((await post({ "x-expected-user-id": id }, {})).status).toBe(400);
    expect((await post({ "x-expected-user-id": id }, { termsVersion: "x" })).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("refuses with 409 policy_version_changed when the accepted versions are not current (rollover)", async () => {
    const stale = { ...currentSignupConsentAcceptance(), termsVersion: "2020-01-01" };
    const response = await post({ "x-expected-user-id": id }, stale);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("policy_version_changed");
    expect((await post({ "x-expected-user-id": id }, { ...currentSignupConsentAcceptance(), minimumAgeVersion: "old" })).status).toBe(409);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("maps outcomes to status codes", async () => {
    mocks.record.mockResolvedValue({ status: "recorded" });
    expect((await post({ "x-expected-user-id": id, origin: "http://localhost" })).status).toBe(200);
    mocks.record.mockResolvedValue({ status: "session_changed" });
    expect((await post({ "x-expected-user-id": id })).status).toBe(409);
    mocks.record.mockResolvedValue({ status: "unauthenticated" });
    expect((await post({ "x-expected-user-id": id })).status).toBe(401);
  });

  it("returns 500 without leaking details when the write fails", async () => {
    mocks.record.mockImplementation(() => { throw new Error("db"); });
    const response = await post({ "x-expected-user-id": id });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db");
  });
});
