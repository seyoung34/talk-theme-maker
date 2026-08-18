import { describe, expect, it, vi } from "vitest";
import { CatalogPublishFailure, publishThemeAsset, type PublishThemeAssetInput } from "@/lib/theme/assetCatalog/publishService";
import type { RegistryStore } from "@/lib/theme/assetCatalog/registryStore";
import type { ThemeAssetObjectRecord } from "@/lib/theme/assetCatalog/registry";
import type { PreviewBucket } from "@/lib/theme/assetCatalog/r2Preview";
import { CatalogPublishError } from "@/lib/theme/assetCatalog/publish";

function pngBytes(width = 100, height = 200, extra = 0) {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** 순서·멱등성만 보면 되므로 메모리 저장소로 충분하다. */
function fakeStore() {
  const rows = new Map<string, ThemeAssetObjectRecord>();
  const calls: string[] = [];
  let nextId = 1;

  const store = {
    async findRevision({ logicalAssetId, revision, variantKey }) {
      return [...rows.values()].find((r) => r.logicalAssetId === logicalAssetId && r.revision === revision && r.variantKey === variantKey) ?? null;
    },
    async findActive({ logicalAssetId, variantKey }) {
      return [...rows.values()].find((r) => r.logicalAssetId === logicalAssetId && r.variantKey === variantKey && r.status === "active") ?? null;
    },
    async insertStaged(input) {
      calls.push("insertStaged");
      const id = `obj-${nextId++}`;
      const record = {
        id, logicalAssetId: input.logicalAssetId, revision: input.revision, variantKey: input.variantKey,
        status: "staged" as const, gcsObjectKey: input.gcsObjectKey, gcsGeneration: input.gcsGeneration,
        sha256: input.sha256, sizeBytes: input.sizeBytes, mimeType: input.mimeType, fileName: input.fileName,
        sourceScale: input.sourceScale, width: input.width, height: input.height,
        pngSignatureVerified: input.pngSignatureVerified, r2Previews: {}, createdAt: "2026-08-19T00:00:00Z",
      } satisfies ThemeAssetObjectRecord;
      rows.set(id, record);
      return record;
    },
    async setPreviews(id, previews) {
      calls.push("setPreviews");
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, r2Previews: previews });
    },
    async activate({ activateId, retireId }) {
      calls.push("activate");
      if (retireId) {
        const old = rows.get(retireId);
        if (old?.status === "active") rows.set(retireId, { ...old, status: "retired" });
      }
      const next = rows.get(activateId);
      if (next?.status === "staged") rows.set(activateId, { ...next, status: "active", activatedAt: "2026-08-19T00:01:00Z" });
    },
    async markFailed(id) {
      calls.push("markFailed");
      const row = rows.get(id);
      if (row?.status === "staged") rows.set(id, { ...row, status: "failed" });
    },
    async countReferences(gcsObjectKey) {
      return [...rows.values()].filter((r) => r.gcsObjectKey === gcsObjectKey && r.status !== "failed").length;
    },
  } satisfies RegistryStore;

  return { store, rows, calls };
}

function fakeBucket(overrides: Partial<PreviewBucket> = {}): PreviewBucket {
  const sizes = new Map<string, number>();
  return {
    put: async (key, value) => { sizes.set(key, (value as Uint8Array).byteLength); return { size: 0 }; },
    head: async (key) => (sizes.has(key) ? { size: sizes.get(key)! } : null),
    ...overrides,
  };
}

const uploader = vi.fn(async () => ({ generation: "17", sizeBytes: 24 }));

function input(overrides: Partial<PublishThemeAssetInput> = {}): PublishThemeAssetInput {
  return {
    logicalAssetId: "asset-1",
    revision: 1,
    variantKey: "ios",
    canonical: { fileName: "main@3x.png", mimeType: "image/png", bytes: pngBytes() },
    ...overrides,
  };
}

describe("publishThemeAsset", () => {
  it("검증이 끝난 뒤에 active로 올린다", async () => {
    const { store, calls } = fakeStore();
    const result = await publishThemeAsset(input(), { store, uploadCatalogObject: uploader, previewBucket: fakeBucket() });

    expect(result.status).toBe("published");
    expect(result.record.status).toBe("active");
    expect(result.record.width).toBe(100);
    expect(result.record.sourceScale).toBe(3);
    // active 전환이 마지막이어야 한다. 앞에서 끊기면 기존 active가 그대로 남는다.
    expect(calls).toEqual(["insertStaged", "activate"]);
  });

  it("이전 active를 retire하고 새 revision을 올린다", async () => {
    const { store, rows } = fakeStore();
    await publishThemeAsset(input(), { store, uploadCatalogObject: uploader, previewBucket: null });
    await publishThemeAsset(input({ revision: 2, canonical: { fileName: "main@3x.png", mimeType: "image/png", bytes: pngBytes(101, 200) } }), {
      store, uploadCatalogObject: uploader, previewBucket: null,
    });

    const statuses = [...rows.values()].map((r) => `${r.revision}:${r.status}`).sort();
    expect(statuses).toEqual(["1:retired", "2:active"]);
  });

  /** 재시도가 이미 끝난 publish를 다시 올리면 안 된다. */
  it("이미 active인 revision은 아무것도 다시 올리지 않는다", async () => {
    const { store, calls } = fakeStore();
    await publishThemeAsset(input(), { store, uploadCatalogObject: uploader, previewBucket: null });
    calls.length = 0;
    const upload = vi.fn(async () => ({ generation: "17", sizeBytes: 24 }));

    const result = await publishThemeAsset(input(), { store, uploadCatalogObject: upload, previewBucket: null });

    expect(result.status).toBe("already-active");
    expect(upload).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  // revision이 곧 내용의 이름이다. 같은 번호로 다른 그림이 들어오면 하류 캐시가 어긋난다.
  it("같은 revision을 다른 바이트로 다시 올리지 않는다", async () => {
    const { store } = fakeStore();
    const deps = { store, uploadCatalogObject: uploader, previewBucket: null };
    await store.insertStaged({
      logicalAssetId: "asset-1", revision: 1, variantKey: "ios", gcsObjectKey: "catalog/v1/aa/x.png",
      gcsGeneration: "1", sha256: "f".repeat(64), sizeBytes: 24, mimeType: "image/png",
      fileName: "main@3x.png", sourceScale: 3, width: 100, height: 200, pngSignatureVerified: true,
    });
    await expect(publishThemeAsset(input(), deps)).rejects.toThrow(CatalogPublishError);
  });

  /**
   * 호출자 오류는 인프라 실패와 구분돼야 한다. 업로드 뒤에 걸리면 떠 있는 객체와 failed 레코드가
   * 남아 두 경우가 같아 보인다. 그래서 바이트를 올리기 전에 막는다.
   */
  it("이전 revision으로 되돌리는 publish를 업로드 전에 거부한다", async () => {
    const { store, rows } = fakeStore();
    await publishThemeAsset(input({ revision: 5 }), { store, uploadCatalogObject: uploader, previewBucket: null });
    const rowsBefore = rows.size;
    const upload = vi.fn(async () => ({ generation: "1", sizeBytes: 24 }));

    const error = await publishThemeAsset(
      input({ revision: 3, canonical: { fileName: "a@3x.png", mimeType: "image/png", bytes: pngBytes(9, 9) } }),
      { store, uploadCatalogObject: upload, previewBucket: null },
    ).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(CatalogPublishError);
    expect(error).not.toBeInstanceOf(CatalogPublishFailure);
    expect(upload).not.toHaveBeenCalled();
    expect(rows.size).toBe(rowsBefore);
  });

  it("preview를 올리고 registry에 키를 남긴다", async () => {
    const { store, calls } = fakeStore();
    const result = await publishThemeAsset(
      input({ previews: [{ presetKey: "card", bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" }] }),
      { store, uploadCatalogObject: uploader, previewBucket: fakeBucket() },
    );

    expect(result.previewsSkipped).toBe(false);
    expect(result.record.r2Previews.card.objectKey).toMatch(/^preview\/v1\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
    expect(calls).toEqual(["insertStaged", "setPreviews", "activate"]);
  });

  /**
   * `next dev`에는 R2 바인딩이 없다. preview만 건너뛰고 catalog publish는 계속되어야
   * 로컬에서도 관리자 저장이 막히지 않는다.
   */
  it("R2 바인딩이 없으면 preview만 건너뛰고 publish는 계속한다", async () => {
    const { store } = fakeStore();
    const result = await publishThemeAsset(
      input({ previews: [{ presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" }] }),
      { store, uploadCatalogObject: uploader, previewBucket: null },
    );

    expect(result.previewsSkipped).toBe(true);
    expect(result.record.status).toBe("active");
  });

  it("catalog 업로드가 실패하면 registry에 아무것도 남기지 않는다", async () => {
    const { store, rows } = fakeStore();
    const failing = vi.fn(async () => { throw new Error("gcs down"); });
    await expect(publishThemeAsset(input(), { store, uploadCatalogObject: failing, previewBucket: null })).rejects.toThrow("gcs down");
    expect(rows.size).toBe(0);
  });

  /** 실패해도 기존 active는 손상되지 않아야 한다. 그것이 §7.3의 "active pointer를 마지막에" 규칙의 목적이다. */
  it("preview 실패는 기존 active를 건드리지 않고 staged를 failed로 남긴다", async () => {
    const { store, rows } = fakeStore();
    await publishThemeAsset(input(), { store, uploadCatalogObject: uploader, previewBucket: null });

    const brokenBucket = fakeBucket({ put: async () => { throw new Error("r2 down"); } });
    await expect(publishThemeAsset(
      input({ revision: 2, canonical: { fileName: "b@3x.png", mimeType: "image/png", bytes: pngBytes(50, 50) }, previews: [{ presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" }] }),
      { store, uploadCatalogObject: uploader, previewBucket: brokenBucket },
    )).rejects.toThrow(CatalogPublishFailure);

    const byRevision = Object.fromEntries([...rows.values()].map((r) => [r.revision, r.status]));
    expect(byRevision).toEqual({ 1: "active", 2: "failed" });
  });

  it("아무도 참조하지 않게 된 객체만 고아 후보로 보고한다", async () => {
    const { store } = fakeStore();
    const brokenBucket = fakeBucket({ put: async () => { throw new Error("r2 down"); } });
    const failure = await publishThemeAsset(
      input({ previews: [{ presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" }] }),
      { store, uploadCatalogObject: uploader, previewBucket: brokenBucket },
    ).catch((error) => error as CatalogPublishFailure);

    expect(failure).toBeInstanceOf(CatalogPublishFailure);
    expect(failure.orphanCandidates).toHaveLength(1);
    expect(failure.orphanCandidates[0]).toMatch(/^catalog\/v1\//);
  });

  it("PNG가 아닌 원본은 업로드 전에 거부한다", async () => {
    const { store } = fakeStore();
    const upload = vi.fn(async () => ({ generation: "1", sizeBytes: 1 }));
    await expect(publishThemeAsset(
      input({ canonical: { fileName: "a.webp", mimeType: "image/webp", bytes: pngBytes() } }),
      { store, uploadCatalogObject: upload, previewBucket: null },
    )).rejects.toThrow(CatalogPublishError);
    expect(upload).not.toHaveBeenCalled();
  });
});
