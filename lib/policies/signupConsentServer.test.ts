import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// 단일 "세션" 모델: getUser와 쓰기가 같은 클라이언트의 JWT 사용자를 본다. 계정 전환은 요청 사이에서만 일어난다.
function fakeClient(sessionUserId: string | null, upsert = vi.fn().mockResolvedValue({ error: null })) {
  const from = vi.fn(() => ({ upsert }));
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue(sessionUserId ? { data: { user: { id: sessionUserId } }, error: null } : { data: { user: null }, error: new Error("no session") }) },
    from,
  } as unknown as SupabaseClient;
  return { client, from, upsert };
}

import { recordEmailSignupConsentForUser } from "@/lib/policies/signupConsentServer";

describe("recordEmailSignupConsentForUser", () => {
  it("records for the verified signup user only", async () => {
    const { client, upsert } = fakeClient("u1");
    expect(await recordEmailSignupConsentForUser(client, "u1")).toEqual({ status: "recorded" });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].every((row: { source: string }) => row.source === "email_signup")).toBe(true);
  });

  it("writes nothing when the session user differs from the expected id (account switched before the write)", async () => {
    const { client, from } = fakeClient("other");
    expect(await recordEmailSignupConsentForUser(client, "u1")).toEqual({ status: "session_changed" });
    expect(from).not.toHaveBeenCalled();
  });

  it("writes nothing without a verified session", async () => {
    const { client, from } = fakeClient(null);
    expect(await recordEmailSignupConsentForUser(client, "u1")).toEqual({ status: "unauthenticated" });
    expect(from).not.toHaveBeenCalled();
  });

  it("concurrent requests with mixed sessions write only for the matching one", async () => {
    const a = fakeClient("u1");
    const b = fakeClient("u2");
    const results = await Promise.all([recordEmailSignupConsentForUser(a.client, "u1"), recordEmailSignupConsentForUser(b.client, "u1")]);
    expect(results.map((r) => r.status)).toEqual(["recorded", "session_changed"]);
    expect(a.upsert).toHaveBeenCalledTimes(1);
    expect(b.from).not.toHaveBeenCalled();
  });
});
