import { afterEach, describe, expect, it, vi } from "vitest";
import { themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";

/**
 * 카드 썸네일의 공개 URL 생성.
 *
 * 갤러리는 마운트 시 받은 URL을 계속 들고 있으므로, 만료되는 주소를 쓰면 탭을 오래 열어 둔
 * 사용자에게 썸네일이 전부 깨진다. 공개 버킷 주소는 서명이 없어 만료되지 않는다.
 */
describe("getPublicThemeAssetUrl", () => {
  async function load(url: string | undefined) {
    vi.resetModules();
    vi.doMock("@/lib/supabase/config", () => ({ supabaseUrl: url }));
    return (await import("@/lib/theme/remoteAssets")).getPublicThemeAssetUrl;
  }

  it("공개 버킷의 영구 주소를 만든다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).toBe(
      "https://example.supabase.co/storage/v1/object/public/theme-public/system-templates/abc/preview/card.webp",
    );
  });

  it("토큰이 붙지 않는다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).not.toContain("token=");
  });

  it("경로 구분자는 유지하고 각 조각만 인코딩한다", async () => {
    // 슬래시까지 인코딩하면 스토리지가 경로로 인식하지 못한다.
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/한글 이름/card.webp")).toBe(
      "https://example.supabase.co/storage/v1/object/public/theme-public/system-templates/%ED%95%9C%EA%B8%80%20%EC%9D%B4%EB%A6%84/card.webp",
    );
  });

  it("경로가 없으면 undefined", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl(undefined)).toBeUndefined();
    expect(getPublicThemeAssetUrl("")).toBeUndefined();
  });

  it("Supabase 주소가 없는 환경에서는 undefined", async () => {
    // e2e 빌드처럼 Supabase 를 끈 환경. 호출부가 색상만으로 카드를 그린다.
    const getPublicThemeAssetUrl = await load(undefined);
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).toBeUndefined();
  });

  // 저장 경로가 고정이라(`system-templates/<id>/preview/card.webp`) 재굽기 후에도 URL이 그대로면
  // cacheControl(1시간) 때문에 브라우저가 이전 이미지를 계속 돌려준다. 버전을 쿼리로 붙여 무효화한다.
  it("version을 주면 캐시 무효화용 쿼리를 붙인다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp", 1700000000000)).toBe(
      "https://example.supabase.co/storage/v1/object/public/theme-public/system-templates/abc/preview/card.webp?v=1700000000000",
    );
  });

  it("version이 없으면 쿼리를 붙이지 않는다", async () => {
    const getPublicThemeAssetUrl = await load("https://example.supabase.co");
    expect(getPublicThemeAssetUrl("system-templates/abc/preview/card.webp")).not.toContain("?");
  });
});

/**
 * 서명 URL 영속 캐시의 접근 횟수.
 *
 * 캐시는 localStorage에 JSON 하나로 들어간다. 경로마다 읽고 쓰면 parse/stringify가 에셋 수만큼
 * 반복되고, localStorage는 동기라 그 시간이 그대로 main thread를 잡는다. 템플릿 하나가 에셋 수십 개를
 * 참조하므로 편집기 부트스트랩에서 바로 드러난다. 조회 시 한 번, 새 URL 저장 직전 병합을 위해 한 번
 * 읽고 결과는 한 번만 쓰는 것을 고정한다.
 */
describe("getThemeAssetSignedUrls 캐시 접근", () => {
  const cacheKey = "kakaotalk-theme-maker:signed-url-cache:v1";
  const paths = ["theme/a.png", "theme/b.png", "theme/c.png"];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // happy-dom의 `window.localStorage`는 접근할 때마다 같은 객체를 돌려주지 않아 spy가 새는다.
  // 호출 횟수를 세는 것이 이 테스트의 전부이므로 저장소 자체를 대역으로 바꾼다.
  function stubStorage(seed?: Record<string, string>) {
    const store = new Map(Object.entries(seed ?? {}));
    const fake = {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
      removeItem: vi.fn((key: string) => void store.delete(key)),
      clear: vi.fn(() => store.clear()),
    };
    vi.stubGlobal("localStorage", fake);
    return fake;
  }

  // 서버가 발급하는 수명 그대로 저장된 항목. 갱신 여유를 빼도 한참 남아 있어야 한다.
  function freshCacheJson(ttlMs = themeAssetSignedUrlTtlSeconds * 1000) {
    const expiresAt = Date.now() + ttlMs;
    return JSON.stringify(Object.fromEntries(paths.map((path) => [path, { signedUrl: `${path}?cached`, expiresAt }])));
  }

  async function load() {
    vi.resetModules();
    vi.doMock("@/lib/supabase/config", () => ({ supabaseUrl: "https://example.supabase.co" }));
    return (await import("@/lib/theme/remoteAssets")).getThemeAssetSignedUrls;
  }

  it("여러 경로를 받아와도 조회와 commit 병합 때만 읽고 한 번만 쓴다", async () => {
    const storage = stubStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ signedUrls: Object.fromEntries(paths.map((path) => [path, `${path}?signed`])) }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const getThemeAssetSignedUrls = await load();

    const result = await getThemeAssetSignedUrls(paths);

    expect(result).toEqual(Object.fromEntries(paths.map((path) => [path, `${path}?signed`])));
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("서로 다른 경로의 병렬 요청 결과를 commit 시점의 최신 캐시에 병합한다", async () => {
    const storage = stubStorage();
    const resolvers = new Map<string, (response: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { paths: string[] };
        const path = body.paths[0];
        return new Promise<Response>((resolve) => resolvers.set(path, resolve));
      }),
    );
    const getThemeAssetSignedUrls = await load();

    const first = getThemeAssetSignedUrls(["theme/first.png"]);
    const second = getThemeAssetSignedUrls(["theme/second.png"]);
    await vi.waitFor(() => expect(resolvers.size).toBe(2));

    resolvers.get("theme/first.png")?.(
      new Response(JSON.stringify({ signedUrls: { "theme/first.png": "first?signed" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await first;
    resolvers.get("theme/second.png")?.(
      new Response(JSON.stringify({ signedUrls: { "theme/second.png": "second?signed" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await second;

    const persisted = JSON.parse(storage.setItem.mock.calls.at(-1)?.[1] ?? "{}") as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(["theme/first.png", "theme/second.png"]);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("전부 캐시에 있으면 한 번만 읽고 요청하지 않는다", async () => {
    const storage = stubStorage({ [cacheKey]: freshCacheJson() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const getThemeAssetSignedUrls = await load();

    const result = await getThemeAssetSignedUrls(paths);

    expect(result).toEqual(Object.fromEntries(paths.map((path) => [path, `${path}?cached`])));
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * URL 재사용 기간이 곧 브라우저 캐시 수명이다.
   *
   * 서명 URL은 만료될 때마다 토큰이 바뀌고, 토큰이 바뀌면 URL이 바뀌고, 브라우저 HTTP 캐시는
   * URL이 키다. 실제로 측정했을 때 URL만 같으면 9건 전부 캐시 적중(8ms), 토큰만 달라지면 9건
   * 전부 재다운로드(588ms)였다. 예전 수명(9분)에서는 세션을 넘기는 순간 무조건 다시 받았다.
   */
  it("하루가 지나도 저장된 URL을 재사용한다", async () => {
    const dayOldEntry = themeAssetSignedUrlTtlSeconds * 1000 - 24 * 60 * 60 * 1000;
    stubStorage({ [cacheKey]: freshCacheJson(dayOldEntry) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const getThemeAssetSignedUrls = await load();

    await getThemeAssetSignedUrls(paths);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("만료가 임박하면 미리 새로 받는다", async () => {
    // 갱신 여유 안에 들어온 URL은 쓰지 않는다. 넘겨받은 쪽에서 만료되면 이미지가 깨진다.
    stubStorage({ [cacheKey]: freshCacheJson(60 * 1000) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ signedUrls: Object.fromEntries(paths.map((p) => [p, `${p}?fresh`])) }), {
        headers: { "content-type": "application/json" },
      })),
    );
    const getThemeAssetSignedUrls = await load();

    const result = await getThemeAssetSignedUrls(paths);

    expect(result[paths[0]]).toBe(`${paths[0]}?fresh`);
  });
});
