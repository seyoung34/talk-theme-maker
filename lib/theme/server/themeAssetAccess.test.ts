import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const variantId = "11111111-2222-4333-8444-555555555555";
const otherVariantId = "99999999-8888-4777-8666-555555555555";
const systemPath = (id: string) => `system-templates/${id}/main-background.png`;
const adminAssetPath = "admin-assets/bubble/rounded.png";

type BundleRow = { status: string; visibility: string };

/**
 * 비관리자 요청의 공개 여부 검사.
 *
 * 이 검사는 서명 URL 요청마다 돌고, 요청마다 DB 조회를 두 번 했다. 같은 템플릿을 여는 사용자가
 * 많을수록 같은 답을 반복 계산한다. 캐시를 붙이되 **판정 결과는 캐시 유무와 무관하게 같아야**
 * 하므로, 조회 횟수와 판정을 함께 고정한다.
 */
describe("checkThemeAssetStorageAccess", () => {
  let variantQueries: string[][];
  let adminAssetQueries: string[][];
  let publicVariants: Record<string, BundleRow>;
  let enabledAssetPaths: string[];

  function createAdminClientStub() {
    return {
      from: vi.fn((table: string) => ({
        select: () => {
          const builder = {
            eq: () => builder,
            in: async (_column: string, values: string[]) => {
              if (table === "system_template_variants") {
                variantQueries.push(values);
                return {
                  data: values.filter((id) => publicVariants[id]).map((id) => ({ id, system_template_bundles: publicVariants[id] })),
                  error: null,
                };
              }
              adminAssetQueries.push(values);
              return { data: values.filter((path) => enabledAssetPaths.includes(path)).map((path) => ({ storage_path: path })), error: null };
            },
          };
          return builder;
        },
      })),
    };
  }

  async function load() {
    // 캐시가 모듈 스코프에 있으므로 테스트마다 새 인스턴스를 받는다.
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
    const { checkThemeAssetStorageAccess } = await import("@/lib/theme/server/themeAssetAccess");
    const adminClient = createAdminClientStub();
    return {
      check: (paths: string[]) =>
        checkThemeAssetStorageAccess(paths, {
          supabase: {} as never,
          adminClient: adminClient as never,
          isAdmin: false,
        }),
      checkAsAdmin: (paths: string[]) =>
        checkThemeAssetStorageAccess(paths, {
          supabase: {} as never,
          adminClient: adminClient as never,
          isAdmin: true,
        }),
    };
  }

  beforeEach(() => {
    variantQueries = [];
    adminAssetQueries = [];
    publicVariants = { [variantId]: { status: "published", visibility: "public" } };
    enabledAssetPaths = [adminAssetPath];
  });

  afterEach(() => {
    vi.doUnmock("@/lib/supabase/server");
  });

  it("공개된 시스템 템플릿 에셋을 허용한다", async () => {
    const { check } = await load();
    await expect(check([systemPath(variantId)])).resolves.toEqual({ ok: true });
  });

  it("같은 variant를 다시 물으면 DB를 다시 조회하지 않는다", async () => {
    const { check } = await load();

    await check([systemPath(variantId)]);
    await check([systemPath(variantId)]);

    expect(variantQueries).toHaveLength(1);
  });

  it("캐시가 있어도 판정은 같다", async () => {
    const { check } = await load();

    const first = await check([systemPath(variantId)]);
    const second = await check([systemPath(variantId)]);

    expect(second).toEqual(first);
  });

  it("모르는 variant만 조회한다", async () => {
    publicVariants[otherVariantId] = { status: "published", visibility: "public" };
    const { check } = await load();

    await check([systemPath(variantId)]);
    await check([systemPath(variantId), systemPath(otherVariantId)]);

    expect(variantQueries[0]).toEqual([variantId]);
    expect(variantQueries[1]).toEqual([otherVariantId]);
  });

  it("비공개 판정도 캐시해서 반복 조회를 막는다", async () => {
    // 긍정만 캐시하면 비공개 리소스를 반복 요청하는 트래픽이 캐시를 그대로 통과한다.
    publicVariants = {};
    const { check } = await load();

    const first = await check([systemPath(variantId)]);
    const second = await check([systemPath(variantId)]);

    expect(first).toEqual({ ok: false, status: 403, error: "공개되지 않은 시스템 템플릿 에셋입니다." });
    expect(second).toEqual(first);
    expect(variantQueries).toHaveLength(1);
  });

  it("게시됐지만 비공개인 번들은 막는다", async () => {
    publicVariants = { [variantId]: { status: "published", visibility: "private" } };
    const { check } = await load();

    await expect(check([systemPath(variantId)])).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("추천 에셋도 같은 방식으로 캐시한다", async () => {
    const { check } = await load();

    await check([adminAssetPath]);
    await check([adminAssetPath]);

    expect(adminAssetQueries).toHaveLength(1);
  });

  it("공개되지 않은 추천 에셋을 막는다", async () => {
    enabledAssetPaths = [];
    const { check } = await load();

    await expect(check([adminAssetPath])).resolves.toEqual({ ok: false, status: 403, error: "공개되지 않은 추천 에셋입니다." });
  });

  it("관리자는 공개 여부를 조회하지 않는다", async () => {
    const { checkAsAdmin } = await load();

    await expect(checkAsAdmin([systemPath(variantId), adminAssetPath])).resolves.toEqual({ ok: true });
    expect(variantQueries).toHaveLength(0);
    expect(adminAssetQueries).toHaveLength(0);
  });

  it("지원하지 않는 경로는 캐시 이전에 막는다", async () => {
    const { check } = await load();

    await expect(check(["exports/whatever.zip"])).resolves.toMatchObject({ ok: false, status: 400 });
    expect(variantQueries).toHaveLength(0);
  });
});
