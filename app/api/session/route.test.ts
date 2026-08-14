import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 세션 조회 라우트.
 *
 * 전 페이지 공통 헤더가 마운트마다 부르는 경로다. 방문자 대부분은 비로그인이라, 그 경우의 비용이
 * 그대로 상시 부하가 된다. 비로그인일 때 Supabase를 아예 건드리지 않는 것과, 로그인 응답 형태가
 * 예전과 같은 것 두 가지를 고정한다.
 */
describe("GET /api/session", () => {
  let cookieList: { name: string }[];
  let createClient: ReturnType<typeof vi.fn>;

  const supabaseStub = (overrides: { user?: { id: string; email: string; user_metadata?: Record<string, unknown> } } = {}) => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: overrides.user ?? null }, error: null })) },
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: table === "admin_profiles" ? { user_id: "u1" } : null, error: null }) }),
          maybeSingle: async () => ({ data: table === "profiles" ? { display_name: "표시 이름" } : null, error: null }),
        }),
      }),
    })),
  });

  async function load() {
    vi.doMock("next/headers", () => ({ cookies: async () => ({ getAll: () => cookieList }) }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient }));
    return (await import("@/app/api/session/route")).GET;
  }

  beforeEach(() => {
    vi.resetModules();
    cookieList = [];
    createClient = vi.fn(async () => supabaseStub());
  });

  afterEach(() => {
    vi.doUnmock("next/headers");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("세션 쿠키가 없으면 Supabase를 부르지 않는다", async () => {
    cookieList = [{ name: "_ga" }, { name: "consent" }];
    const GET = await load();

    const response = await GET();

    expect(await response.json()).toEqual({ user: null, isAdmin: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("쿠키가 하나도 없어도 같은 응답이다", async () => {
    const GET = await load();

    const response = await GET();

    expect(await response.json()).toEqual({ user: null, isAdmin: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("세션 쿠키가 있으면 기존 경로를 그대로 탄다", async () => {
    cookieList = [{ name: "sb-abcdefgh-auth-token" }];
    createClient = vi.fn(async () => supabaseStub({ user: { id: "u1", email: "user@example.com" } }));
    const GET = await load();

    const response = await GET();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      user: { email: "user@example.com", displayName: "표시 이름" },
      isAdmin: true,
    });
  });

  it("쿠키는 있는데 세션이 만료됐으면 비로그인 응답이다", async () => {
    // 쿠키 존재는 인증 판정이 아니다. 실제 판정은 getUser()가 한다.
    cookieList = [{ name: "sb-abcdefgh-auth-token" }];
    const GET = await load();

    const response = await GET();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ user: null, isAdmin: false });
  });
});
