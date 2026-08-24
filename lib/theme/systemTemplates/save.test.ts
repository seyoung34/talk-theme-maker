import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThemeSlots } from "@/lib/theme/templates";
import type { SystemTemplateSaveInput } from "@/lib/theme/systemTemplates/types";

const bundleId = "22222222-3333-4444-8555-666666666666";
const mainBackgroundSlot = getThemeSlots("android").find((slot) => slot.role === "main_background");
if (!mainBackgroundSlot) throw new Error("main_background slot is missing.");
const mainBackgroundSlotId: string = mainBackgroundSlot.id;

describe("systemTemplateRepository.save storage transaction", () => {
  let createClient: ReturnType<typeof vi.fn>;
  let bundleInsertError: { message: string } | null;
  let variantUpsertError: { message: string } | null;
  let uploadCalls: { bucket: string; path: string }[];
  let removeCalls: { bucket: string; paths: string[] }[];
  let bundleDeleteCalls: string[];
  let variantUpsertCalls: Record<string, unknown>[];
  let bundleInsertCalls: Record<string, unknown>[];
  let bundleUpdateCalls: Record<string, unknown>[];
  let existingVariantStorage: { upload_refs: unknown; preview_metadata: unknown } | null;
  let generateThumbnail: ReturnType<typeof vi.fn>;

  function createClientStub() {
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } }, error: null })) },
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (path: string) => {
            uploadCalls.push({ bucket, path });
            return { error: null };
          }),
          remove: vi.fn(async (paths: string[]) => {
            removeCalls.push({ bucket, paths });
            return { error: null };
          }),
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "system_template_bundles") {
          return {
            insert: vi.fn((payload: Record<string, unknown>) => {
              bundleInsertCalls.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: bundleInsertError ? null : {
                      id: bundleId,
                      title: "테스트 템플릿",
                      description: null,
                      status: "draft",
                      visibility: "private",
                      pricing_type: "free",
                      price_amount: null,
                      credit_cost: null,
                      tags: [],
                      created_at: "2026-08-22T00:00:00.000Z",
                      updated_at: "2026-08-22T00:00:00.000Z",
                    },
                    error: bundleInsertError,
                  })),
                })),
              };
            }),
            update: vi.fn((payload: Record<string, unknown>) => {
              bundleUpdateCalls.push(payload);
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: bundleInsertError ? null : {
                        id: bundleId,
                        title: "테스트 템플릿",
                        description: null,
                        status: "draft",
                        visibility: "private",
                        pricing_type: "free",
                        price_amount: null,
                        credit_cost: null,
                        tags: [],
                        created_at: "2026-08-22T00:00:00.000Z",
                        updated_at: "2026-08-22T00:00:00.000Z",
                      },
                      error: bundleInsertError,
                    })),
                  })),
                })),
              };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(async (_column: string, id: string) => {
                bundleDeleteCalls.push(id);
                return { error: null };
              }),
            })),
          };
        }
        if (table === "system_template_variants") {
          return {
            select: vi.fn((columns: string) => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: columns === "upload_refs,preview_metadata" ? existingVariantStorage : null, error: null })),
              })),
            })),
            upsert: vi.fn((payload: Record<string, unknown>) => {
              variantUpsertCalls.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: variantUpsertError ? null : { ...payload, updated_at: "2026-08-22T00:00:00.000Z" },
                    error: variantUpsertError,
                  })),
                })),
              };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  async function load() {
    vi.resetModules();
    vi.doMock("@/lib/supabase/client", () => ({ createClient }));
    vi.doMock("@/lib/theme/remoteAssets", () => ({
      getThemeAssetSignedUrls: vi.fn(),
      sanitizeStoragePathPart: (value: string) => value.replace(/[^\w.-]+/g, "-"),
      storagePathToFile: vi.fn(),
      themeAssetsBucketName: "theme-assets",
      themePublicBucketName: "theme-public",
    }));
    vi.doMock("@/lib/theme/systemTemplates/adminSignedUrls", () => ({
      createAdminThemeAssetSignedUrls: vi.fn(async (_supabase: unknown, paths: string[]) => Object.fromEntries(paths.map((path) => [path, `https://signed.test/${path}`]))),
    }));
    vi.doMock("@/lib/theme/systemTemplates/thumbnail", () => ({
      generateSystemTemplateThumbnail: generateThumbnail,
      thumbnailTabIconRoles: [],
    }));
    vi.doMock("@/lib/theme/systemTemplates/preview", () => ({
      createSystemTemplatePreviewVisual: vi.fn(() => ({})),
      previewRoles: [],
      tabIconPreviewRoles: [],
    }));
    vi.doMock("@/lib/theme/systemTemplates/screenPreview", () => ({
      findUnsignedPreviewAssets: vi.fn((paths: string[], signedUrls: Record<string, string>) => paths.filter((path) => !signedUrls[path])),
      generatePreviewScreens: vi.fn(async () => ({})),
    }));
    return (await import("@/lib/theme/systemTemplates/supabaseRepository")).systemTemplateRepository;
  }

  function input(): SystemTemplateSaveInput {
    return {
      title: "테스트 템플릿",
      description: "저장 실패 정리 테스트",
      baseTemplateId: "basic",
      platform: "android",
      status: "draft",
      visibility: "private",
      pricingType: "free",
      tags: [],
      overrides: {
        colors: {},
        uploads: {
          [mainBackgroundSlotId]: [{
            id: "upload-1",
            file: new File(["asset-bytes"], "background.png", { type: "image/png" }),
            source: "template",
          }],
        },
        candidateSelections: {},
        bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, designs: {} },
      },
    };
  }

  beforeEach(() => {
    bundleInsertError = null;
    variantUpsertError = null;
    uploadCalls = [];
    removeCalls = [];
    bundleDeleteCalls = [];
    variantUpsertCalls = [];
    bundleInsertCalls = [];
    bundleUpdateCalls = [];
    existingVariantStorage = null;
    generateThumbnail = vi.fn(async () => null);
    const client = createClientStub();
    createClient = vi.fn(() => client);
  });

  afterEach(() => {
    for (const moduleName of [
      "@/lib/supabase/client",
      "@/lib/theme/remoteAssets",
      "@/lib/theme/systemTemplates/adminSignedUrls",
      "@/lib/theme/systemTemplates/thumbnail",
      "@/lib/theme/systemTemplates/preview",
      "@/lib/theme/systemTemplates/screenPreview",
    ]) vi.doUnmock(moduleName);
  });

  it("새 템플릿 bundle 저장 전에 실패하면 업로드한 private/public 경로를 정리한다", async () => {
    bundleInsertError = { message: "bundle insert failed" };
    const repository = await load();

    await expect(repository.save(input())).rejects.toMatchObject({ message: "bundle insert failed" });

    expect(uploadCalls).toHaveLength(1);
    expect(removeCalls).toEqual(expect.arrayContaining([
      { bucket: "theme-assets", paths: [expect.stringContaining("background.png")] },
    ]));
    expect(bundleInsertCalls).toHaveLength(1);
    expect(variantUpsertCalls).toHaveLength(0);
    expect(bundleDeleteCalls).toHaveLength(0);
  });

  it("새 variant 저장이 실패하면 bundle과 이미 올린 파일을 함께 정리한다", async () => {
    variantUpsertError = { message: "variant upsert failed" };
    const repository = await load();

    await expect(repository.save(input())).rejects.toMatchObject({ message: "variant upsert failed" });

    expect(uploadCalls).toHaveLength(1);
    expect(removeCalls).toEqual(expect.arrayContaining([
      { bucket: "theme-assets", paths: [expect.stringContaining("background.png")] },
    ]));
    expect(variantUpsertCalls).toHaveLength(1);
    expect(bundleDeleteCalls).toEqual([bundleId]);
  });

  it("기존 variant 저장이 실패해도 이전 경로는 지우거나 덮어쓰지 않는다", async () => {
    const oldPrivatePath = "system-templates/existing/background/background.png";
    const oldCardPath = "system-templates/existing/preview/card.webp";
    existingVariantStorage = {
      upload_refs: {
        [mainBackgroundSlotId]: [{ id: "old-upload", fileName: "background.png", mimeType: "image/png", size: 10, storagePath: oldPrivatePath }],
      },
      preview_metadata: { cardPreviewPath: oldCardPath },
    };
    variantUpsertError = { message: "existing variant upsert failed" };
    generateThumbnail.mockResolvedValue(new Blob(["thumb"], { type: "image/webp" }));
    const repository = await load();

    await expect(repository.save({ ...input(), id: "11111111-2222-4333-8444-555555555555", bundleId })).rejects.toMatchObject({
      message: "existing variant upsert failed",
    });

    expect(bundleUpdateCalls).toHaveLength(1);
    expect(uploadCalls.some(({ path }) => path === oldPrivatePath || path === oldCardPath)).toBe(false);
    expect(removeCalls.flatMap(({ paths }) => paths)).not.toContain(oldPrivatePath);
    expect(removeCalls.flatMap(({ paths }) => paths)).not.toContain(oldCardPath);
    expect(removeCalls).toEqual(expect.arrayContaining([
      { bucket: "theme-assets", paths: [expect.stringContaining("/revisions/")] },
      { bucket: "theme-public", paths: [expect.stringContaining("/revisions/")] },
    ]));
  });
});
