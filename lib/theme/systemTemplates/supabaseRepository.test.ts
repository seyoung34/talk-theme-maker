import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeAssetSignedUrlTtlSeconds } from "@/lib/theme/themeAssetSigning";
import type { SystemTemplatePreviewMetadata } from "@/lib/theme/systemTemplates/types";

/**
 * 관리자 프리뷰 재생성의 실패 처리.
 *
 * 예전에는 썸네일 관련 실패를 전부 catch 해서 "기존 썸네일 유지"로 넘겼다. 그래서 서명 URL
 * 생성이나 업로드가 서버 문제로 죽어도 호출자는 성공으로 보고, 템플릿 수만큼 같은 요청을
 * 계속 내보냈다. 인프라 실패는 던지고, 이미지/캔버스 실패만 삼키는 것이 이 경로의 계약이다.
 */
describe("systemTemplateRepository.regeneratePreviewMetadata", () => {
  const variantId = "11111111-2222-4333-8444-555555555555";
  const previousCardPath = "system-templates/old/preview/card.webp";
  const previousScreenPreviews = { friends: "system-templates/old/preview/friends.webp" };
  const assetPath = "system-templates/asset/main-background.png";

  let generateThumbnail: ReturnType<typeof vi.fn>;
  let createSignedUrls: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let updates: Record<string, unknown>[];
  let warn: ReturnType<typeof vi.spyOn>;

  async function load(mainBackgroundSlotId: string) {
    const row = {
      base_template_id: "basic",
      platform: "android",
      colors: {},
      candidate_selections: {},
      bubble_edits: null,
      upload_refs: {
        [mainBackgroundSlotId]: [
          { id: "upload-1", fileName: "bg.png", mimeType: "image/png", size: 10, storagePath: assetPath },
        ],
      },
      preview_metadata: { cardPreviewPath: previousCardPath, screenPreviews: previousScreenPreviews },
    };

    const client = {
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      })),
      storage: { from: vi.fn(() => ({ createSignedUrls, upload })) },
    };

    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => client }));
    vi.doMock("@/lib/theme/systemTemplates/thumbnail", () => ({
      generateSystemTemplateThumbnail: generateThumbnail,
      thumbnailTabIconRoles: [],
    }));
    return (await import("@/lib/theme/systemTemplates/supabaseRepository")).systemTemplateRepository;
  }

  beforeEach(async () => {
    vi.resetModules();
    updates = [];
    generateThumbnail = vi.fn(async () => new Blob(["thumb"], { type: "image/webp" }));
    createSignedUrls = vi.fn(async () => ({ data: [{ path: assetPath, signedUrl: "https://signed/bg" }], error: null }));
    upload = vi.fn(async () => ({ error: null }));
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.doUnmock("@/lib/supabase/client");
    vi.doUnmock("@/lib/theme/systemTemplates/thumbnail");
  });

  async function mainBackgroundSlotId() {
    const { getThemeSlots } = await import("@/lib/theme/templates");
    const slot = getThemeSlots("android").find((item) => item.role === "main_background");
    if (!slot) throw new Error("main_background slot is missing.");
    return slot.id;
  }

  it("Next.js 라우트가 아니라 Supabase Storage로 직접 서명한다", async () => {
    const repository = await load(await mainBackgroundSlotId());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await repository.regeneratePreviewMetadata(variantId);

    expect(createSignedUrls).toHaveBeenCalledWith([assetPath], themeAssetSignedUrlTtlSeconds);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("정상 처리하면 카드 썸네일 경로를 갱신한다", async () => {
    const repository = await load(await mainBackgroundSlotId());

    await repository.regeneratePreviewMetadata(variantId);

    expect(upload).toHaveBeenCalledTimes(1);
    const metadata = updates.at(-1)?.preview_metadata as SystemTemplatePreviewMetadata;
    expect(metadata.cardPreviewPath).toBe(`system-templates/${variantId}/preview/card.webp`);
  });

  it("서명 실패는 호출자에게 전달하고 메타를 갱신하지 않는다", async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const repository = await load(await mainBackgroundSlotId());

    await expect(repository.regeneratePreviewMetadata(variantId)).rejects.toMatchObject({ message: "permission denied" });
    expect(generateThumbnail).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("업로드 실패도 호출자에게 전달한다", async () => {
    upload.mockResolvedValue({ error: { message: "storage unavailable" } });
    const repository = await load(await mainBackgroundSlotId());

    await expect(repository.regeneratePreviewMetadata(variantId)).rejects.toMatchObject({ message: "storage unavailable" });
    expect(updates).toHaveLength(0);
  });

  it("이미지/캔버스 렌더 실패는 기존 썸네일을 유지하고 메타 갱신을 계속한다", async () => {
    generateThumbnail.mockRejectedValue(new Error("Thumbnail image load failed."));
    const repository = await load(await mainBackgroundSlotId());

    await expect(repository.regeneratePreviewMetadata(variantId)).resolves.toBeUndefined();

    expect(upload).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    const metadata = updates[0].preview_metadata as SystemTemplatePreviewMetadata;
    expect(metadata.cardPreviewPath).toBe(previousCardPath);
    expect(metadata.refs?.mainBackground).toBe(assetPath);
  });

  /**
   * 굽기는 최적화다. 못 구웠다고 이미 있는 경로를 지우면 모달이 멀쩡히 쓰던 이미지를 잃고
   * 원본 에셋을 받는 폴백으로 떨어진다 — 고치려던 문제로 되돌아간다.
   */
  it("화면을 구울 수 없는 환경에서도 기존 화면 프리뷰 경로를 지우지 않는다", async () => {
    const repository = await load(await mainBackgroundSlotId());

    await repository.regeneratePreviewMetadata(variantId);

    const metadata = updates.at(-1)?.preview_metadata as SystemTemplatePreviewMetadata;
    expect(metadata.screenPreviews).toEqual(previousScreenPreviews);
  });

  /**
   * 서명이 빠진 채로 구우면 그 에셋만 없는 화면이 완성되고, 업로드된 뒤에는 갤러리가 그것을
   * 영구히 우선한다. 일시적인 서명 실패가 실제 테마와 다른 미리보기로 굳는다.
   * 굽지 않으면 모달이 원본을 받아 그리는 폴백으로 떨어질 뿐이다 — 느리지만 정확하다.
   */
  it("에셋 서명이 빠지면 화면을 굽지 않고 이전 경로를 유지한다", async () => {
    // 서명은 성공했지만 요청한 경로가 결과에 없는 경우.
    createSignedUrls.mockResolvedValue({ data: [], error: null });
    const repository = await load(await mainBackgroundSlotId());

    await expect(repository.regeneratePreviewMetadata(variantId)).rejects.toThrow(assetPath);
    expect(updates).toHaveLength(0);
  });

  it("캔버스를 쓸 수 없어 썸네일이 없으면 업로드 없이 메타만 갱신한다", async () => {
    // SSR/비지원 환경에서는 generateSystemTemplateThumbnail이 null을 돌려준다.
    generateThumbnail.mockResolvedValue(null);
    const repository = await load(await mainBackgroundSlotId());

    await repository.regeneratePreviewMetadata(variantId);

    expect(upload).not.toHaveBeenCalled();
    expect((updates[0].preview_metadata as SystemTemplatePreviewMetadata).cardPreviewPath).toBe(previousCardPath);
  });
});

/**
 * 원격 업로드 수화의 서명 요청 수.
 *
 * `storagePathToFile`은 경로를 하나씩 서명한다. 그래서 50개 단위 배치가 있는데도 걸리지 않아,
 * 에셋 30개짜리 템플릿을 열면 `/api/theme-assets/signed-urls` 요청이 30건 나갔다. 요청마다
 * Worker가 인증과 공개 여부 조회를 처음부터 반복하므로 요청 수가 곧 CPU 예산이다.
 * 루프 앞의 예열이 실제로 캐시에 적중하는지를 요청 수로 고정한다.
 */
describe("systemTemplateRepository.hydrateUploads 서명 요청 수", () => {
  const assetCount = 12;
  const uploadRefs = Object.fromEntries(
    Array.from({ length: assetCount }, (_, index) => [
      `slot-${index}`,
      [{ id: `u${index}`, fileName: `asset-${index}.png`, mimeType: "image/png", size: 1, storagePath: `system-templates/x/asset-${index}.png` }],
    ]),
  );

  let signedUrlRequests: string[][];
  let warn: ReturnType<typeof vi.spyOn>;

  function stubFetch({ failBatch = false }: { failBatch?: boolean } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("/api/theme-assets/signed-urls")) return new Response(new Blob(["file"]), { status: 200 });

        const body = JSON.parse(String(init?.body)) as { paths: string[] };
        signedUrlRequests.push(body.paths);
        // 배치 실패만 재현한다. 단건 서명은 계속 동작해야 폴백을 확인할 수 있다.
        if (failBatch && body.paths.length > 1) {
          return new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ signedUrls: Object.fromEntries(body.paths.map((path) => [path, `https://signed/${path}`])) }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
  }

  async function loadRepository() {
    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
    return (await import("@/lib/theme/systemTemplates/supabaseRepository")).systemTemplateRepository;
  }

  beforeEach(() => {
    vi.resetModules();
    // 서명 캐시는 localStorage에도 남는다. 앞 테스트의 저장본이 새 테스트의 요청 수를 가린다.
    window.localStorage.clear();
    signedUrlRequests = [];
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/supabase/client");
  });

  it("에셋을 여러 개 받아도 서명 요청은 한 번이다", async () => {
    stubFetch();
    const repository = await loadRepository();

    const uploads = await repository.hydrateUploads(uploadRefs as never);

    expect(Object.keys(uploads)).toHaveLength(assetCount);
    expect(signedUrlRequests).toHaveLength(1);
    expect(signedUrlRequests[0]).toHaveLength(assetCount);
  });

  it("prewarmUploads가 같은 경로를 한 번에 요청한다", async () => {
    stubFetch();
    const repository = await loadRepository();

    await repository.prewarmUploads(uploadRefs as never);

    expect(signedUrlRequests).toHaveLength(1);
    expect(signedUrlRequests[0]).toHaveLength(assetCount);
  });

  it("예열이 실패해도 수화 결과는 같다", async () => {
    // 예열은 최적화다. 실패하면 단건 서명으로 되돌아가되 파일 목록은 그대로여야 한다.
    stubFetch({ failBatch: true });
    const repository = await loadRepository();

    const uploads = await repository.hydrateUploads(uploadRefs as never);

    expect(Object.keys(uploads)).toHaveLength(assetCount);
    expect(signedUrlRequests.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalled();
  });

  it("catalog-only ref는 원본 파일을 받지 않고 legacy 경로는 미리보기 URL에만 쓴다", async () => {
    stubFetch();
    const repository = await loadRepository();
    const catalogRefs = {
      background: [{
        id: "catalog-1",
        fileName: "background.png",
        mimeType: "image/png",
        size: 12,
        catalog: { kind: "catalog", assetId: "admin:asset", revision: 2, variantKey: "canonical" },
        catalogMetadata: {
          fileName: "background.png",
          mimeType: "image/png",
          size: 12,
          sourceScale: 3,
          width: 120,
          height: 80,
          pngSignatureVerified: true,
          legacyStoragePath: "system-templates/x/background.png",
        },
      }],
    };

    const uploads = await repository.hydrateUploads(catalogRefs as never);
    const entry = uploads.background?.[0];
    expect(entry?.file).toBeUndefined();
    expect(entry?.catalog?.selection).toEqual(catalogRefs.background[0].catalog);
    expect(entry?.catalog?.previewUrl).toBe("https://signed/system-templates/x/background.png");
    expect(signedUrlRequests).toHaveLength(1);
    expect(signedUrlRequests[0]).toEqual(["system-templates/x/background.png"]);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => !String(url).includes("/api/theme-assets/signed-urls"))).toBe(false);
  });
});
