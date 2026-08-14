import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      preview_metadata: { cardPreviewPath: previousCardPath },
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

    expect(createSignedUrls).toHaveBeenCalledWith([assetPath], 600);
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

  it("캔버스를 쓸 수 없어 썸네일이 없으면 업로드 없이 메타만 갱신한다", async () => {
    // SSR/비지원 환경에서는 generateSystemTemplateThumbnail이 null을 돌려준다.
    generateThumbnail.mockResolvedValue(null);
    const repository = await load(await mainBackgroundSlotId());

    await repository.regeneratePreviewMetadata(variantId);

    expect(upload).not.toHaveBeenCalled();
    expect((updates[0].preview_metadata as SystemTemplatePreviewMetadata).cardPreviewPath).toBe(previousCardPath);
  });
});
