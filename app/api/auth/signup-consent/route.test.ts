import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/policies/signupConsentServer", () => ({
  signupConsentExpectedUserHeader: "x-expected-user-id",
  recordEmailSignupConsentForUser: mocks.record,
}));

import { POST } from "@/app/api/auth/signup-consent/route";

const id = "11111111-1111-4111-8111-111111111111";
// happy-dom의 Request는 origin 같은 금지 헤더를 지우므로 헤더 조회만 흉내 낸 요청을 쓴다.
const post = (headers: Record<string, string> = {}) =>
  POST({ url: "http://localhost/api/auth/signup-consent", headers: { get: (name: string) => headers[name] ?? null } } as unknown as Request);

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
