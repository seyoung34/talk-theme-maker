import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteSlotUploads, SystemTemplatePreviewMetadata } from "@/lib/theme/systemTemplates/types";

const bundleId = "11111111-2222-4333-8444-555555555555";
const firstVariantId = "22222222-3333-4444-8555-666666666666";
const secondVariantId = "33333333-4444-4555-8666-777777777777";

type StoredVariant = {
  id: string;
  bundle_id: string;
  upload_refs: RemoteSlotUploads;
  preview_metadata: SystemTemplatePreviewMetadata;
};

describe("systemTemplateRepository.delete", () => {
  let variants: StoredVariant[];
  let removedFiles: { bucket: string; paths: string[] }[];
  let deletedBundleIds: string[];
  let deletedVariantIds: string[];
  let storageObjects: { bucket: string; path: string }[];
  let storageListErrorBuckets: Set<string>;

  function createClient() {
    return {
      from: vi.fn((table: string) => {
        if (table === "system_template_variants") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((column: string, value: string) => {
                if (column === "id") {
                  return {
                    maybeSingle: vi.fn(async () => ({ data: variants.find((variant) => variant.id === value) ?? null, error: null })),
                  };
                }
                const result = { data: variants.filter((variant) => variant.bundle_id === value), error: null };
                return Object.assign(Promise.resolve(result), {
                  limit: vi.fn(async () => result),
                });
              }),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn((_column: string, value: string) => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    const index = variants.findIndex((variant) => variant.id === value);
                    if (index < 0) return { data: null, error: null };
                    variants.splice(index, 1);
                    deletedVariantIds.push(value);
                    return { data: { id: value }, error: null };
                  }),
                })),
              })),
            })),
          };
        }
        if (table === "system_template_bundles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_column: string, value: string) => ({
                maybeSingle: vi.fn(async () => ({ data: { id: value }, error: null })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn((_column: string, value: string) => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    deletedBundleIds.push(value);
                    variants = variants.filter((variant) => variant.bundle_id !== value);
                    return { data: { id: value }, error: null };
                  }),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn((name: string, args: { p_variant_id: string }) => {
        if (name !== "delete_system_template_variant") throw new Error(`Unexpected RPC: ${name}`);
        return {
          maybeSingle: vi.fn(async () => {
            const index = variants.findIndex((variant) => variant.id === args.p_variant_id);
            if (index < 0) return { data: null, error: null };
            const [deleted] = variants.splice(index, 1);
            deletedVariantIds.push(args.p_variant_id);
            const bundleDeleted = !variants.some((variant) => variant.bundle_id === deleted.bundle_id);
            if (bundleDeleted) deletedBundleIds.push(deleted.bundle_id);
            return { data: { ...deleted, bundle_deleted: bundleDeleted }, error: null };
          }),
        };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          list: vi.fn(async (directory: string) => {
            if (storageListErrorBuckets.has(bucket)) return { data: null, error: { message: "storage list failed" } };
            const folders = new Set<string>();
            const files: string[] = [];
            for (const object of storageObjects) {
              if (object.bucket !== bucket || !object.path.startsWith(`${directory}/`)) continue;
              const relative = object.path.slice(directory.length + 1);
              const [name, ...rest] = relative.split("/");
              if (rest.length) folders.add(name);
              else files.push(name);
            }
            return {
              data: [
                ...Array.from(folders, (name) => ({ name, id: null, metadata: null })),
                ...files.map((name) => ({ name, id: `${directory}/${name}`, metadata: {} })),
              ],
              error: null,
            };
          }),
          remove: vi.fn(async (paths: string[]) => {
            removedFiles.push({ bucket, paths });
            return { error: null };
          }),
        })),
      },
    };
  }

  async function loadRepository() {
    vi.resetModules();
    const client = createClient();
    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => client }));
    return (await import("@/lib/theme/systemTemplates/supabaseRepository")).systemTemplateRepository;
  }

  beforeEach(() => {
    variants = [
      {
        id: firstVariantId,
        bundle_id: bundleId,
        upload_refs: {
          background: [
            {
              id: "first-upload",
              fileName: "first.png",
              mimeType: "image/png",
              size: 1,
              storagePath: `system-templates/${firstVariantId}/revisions/first/first.png`,
              catalogMetadata: { fileName: "catalog.png", mimeType: "image/png", size: 1, sourceScale: 1, width: 1, height: 1, pngSignatureVerified: true, legacyStoragePath: "catalog/shared.png" },
            },
          ],
        },
        preview_metadata: {
          cardPreviewPath: `system-templates/${firstVariantId}/preview/card.webp`,
          screenPreviews: { friends: `system-templates/${firstVariantId}/preview/friends.webp` },
        },
      },
      {
        id: secondVariantId,
        bundle_id: bundleId,
        upload_refs: {
          background: [{ id: "second-upload", fileName: "second.png", mimeType: "image/png", size: 1, storagePath: `system-templates/${secondVariantId}/second.png` }],
        },
        preview_metadata: { cardPreviewPath: `system-templates/${secondVariantId}/preview/card.webp` },
      },
    ];
    removedFiles = [];
    deletedBundleIds = [];
    deletedVariantIds = [];
    storageListErrorBuckets = new Set();
    storageObjects = [
      { bucket: "theme-assets", path: `system-templates/${firstVariantId}/revisions/old/orphan.png` },
      { bucket: "theme-assets", path: `system-templates/${secondVariantId}/revisions/old/orphan.png` },
      { bucket: "theme-public", path: `system-templates/${firstVariantId}/preview/old.webp` },
      { bucket: "theme-public", path: `system-templates/${secondVariantId}/preview/old.webp` },
    ];
    for (const variant of variants) {
      for (const entries of Object.values(variant.upload_refs)) {
        for (const entry of entries ?? []) {
          if (entry.storagePath) storageObjects.push({ bucket: "theme-assets", path: entry.storagePath });
        }
      }
      for (const path of [variant.preview_metadata.cardPreviewPath, ...Object.values(variant.preview_metadata.screenPreviews ?? {})]) {
        if (path) storageObjects.push({ bucket: "theme-public", path });
      }
    }
  });

  it("bundle 전체 삭제는 로드되지 않은 variant까지 cascade로 삭제하고 소유 경로만 정리한다", async () => {
    const repository = await loadRepository();

    await expect(repository.deleteBundle(bundleId)).resolves.toEqual({ deleted: true, storageCleanupFailed: false, bundleCleanupFailed: false });

    expect(deletedBundleIds).toEqual([bundleId]);
    expect(deletedVariantIds).toEqual([]);
    expect(variants).toHaveLength(0);
    expect(removedFiles).toEqual(expect.arrayContaining([
      { bucket: "theme-assets", paths: expect.arrayContaining([
        `system-templates/${firstVariantId}/revisions/first/first.png`,
        `system-templates/${secondVariantId}/second.png`,
        `system-templates/${firstVariantId}/revisions/old/orphan.png`,
        `system-templates/${secondVariantId}/revisions/old/orphan.png`,
      ]) },
      { bucket: "theme-public", paths: expect.arrayContaining([
        `system-templates/${firstVariantId}/preview/card.webp`,
        `system-templates/${firstVariantId}/preview/friends.webp`,
        `system-templates/${secondVariantId}/preview/card.webp`,
        `system-templates/${firstVariantId}/preview/old.webp`,
        `system-templates/${secondVariantId}/preview/old.webp`,
      ]) },
    ]));
    expect(removedFiles.flatMap((entry) => entry.paths)).not.toContain("catalog/shared.png");
  });

  it("플랫폼 삭제는 해당 variant와 파일만 삭제하고 다른 플랫폼 variant는 남긴다", async () => {
    const repository = await loadRepository();

    await expect(repository.delete(firstVariantId)).resolves.toEqual({ deleted: true, storageCleanupFailed: false, bundleCleanupFailed: false });

    expect(deletedVariantIds).toEqual([firstVariantId]);
    expect(deletedBundleIds).toHaveLength(0);
    expect(variants.map((variant) => variant.id)).toEqual([secondVariantId]);
    expect(removedFiles.flatMap((entry) => entry.paths)).toEqual([
      `system-templates/${firstVariantId}/revisions/first/first.png`,
      `system-templates/${firstVariantId}/revisions/old/orphan.png`,
      `system-templates/${firstVariantId}/preview/card.webp`,
      `system-templates/${firstVariantId}/preview/friends.webp`,
      `system-templates/${firstVariantId}/preview/old.webp`,
    ]);
  });

  it("마지막 variant를 삭제하면 빈 bundle도 함께 삭제한다", async () => {
    variants = [variants[0]];
    const repository = await loadRepository();

    await expect(repository.delete(firstVariantId)).resolves.toEqual({ deleted: true, storageCleanupFailed: false, bundleCleanupFailed: false });

    expect(deletedVariantIds).toEqual([firstVariantId]);
    expect(deletedBundleIds).toEqual([bundleId]);
    expect(variants).toHaveLength(0);
  });

  it("Storage 목록 조회가 실패해도 참조된 파일은 지우고 실패 상태를 반환한다", async () => {
    storageListErrorBuckets.add("theme-assets");
    const repository = await loadRepository();

    await expect(repository.delete(firstVariantId)).resolves.toEqual({ deleted: true, storageCleanupFailed: true, bundleCleanupFailed: false });

    expect(removedFiles).toEqual(expect.arrayContaining([
      { bucket: "theme-assets", paths: [`system-templates/${firstVariantId}/revisions/first/first.png`] },
      { bucket: "theme-public", paths: expect.arrayContaining([
        `system-templates/${firstVariantId}/preview/card.webp`,
        `system-templates/${firstVariantId}/preview/friends.webp`,
        `system-templates/${firstVariantId}/preview/old.webp`,
      ]) },
    ]));
  });
});
