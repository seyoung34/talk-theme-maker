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
  let failActivation = false;

  const store = {
    async findRevision({ logicalAssetId, revision, variantKey }) {
      return [...rows.values()].find((r) => r.logicalAssetId === logicalAssetId && r.revision === revision && r.variantKey === variantKey) ?? null;
    },
    async findLatestRevision({ logicalAssetId, variantKey }) {
      // staged/failed/retired까지 센다. 실제 store와 같은 규칙이어야 경합 테스트가 의미를 갖는다.
      const revisions = [...rows.values()]
        .filter((r) => r.logicalAssetId === logicalAssetId && r.variantKey === variantKey)
        .map((r) => r.revision);
      return revisions.length ? Math.max(...revisions) : 0;
    },
    async findActive({ logicalAssetId, variantKey }) {
      return [...rows.values()].find((r) => r.logicalAssetId === logicalAssetId && r.variantKey === variantKey && r.status === "active") ?? null;
    },
    // publish 흐름은 쓰지 않는다. export 해석 경로 전용이라 계약만 맞춘다.
    async findActiveByKeys(keys) {
      return [...rows.values()].filter((r) => r.status === "active"
        && keys.some((k) => k.logicalAssetId === r.logicalAssetId && k.variantKey === r.variantKey));
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
    /**
     * 실제 구현은 RPC 한 번으로 두 UPDATE를 한 트랜잭션에 넣는다. 여기서도 원자적으로 흉내 내되,
     * `failActivation`을 켜면 트랜잭션이 통째로 실패한 상황을 만든다 — 즉 이전 active가 그대로 남는다.
     */
    /**
     * `activate_theme_asset_object` RPC와 같은 규칙을 따른다. 호출자가 넘긴 `retireId`가 아니라
     * **지금 실제로 active인 행**을 내린다. 호출자는 바이트를 올리기 전에 읽은 active를 넘기므로
     * 그 사이 다른 게시가 끼어들면 어긋나기 때문이다. 전진 전용 가드도 함께 흉내낸다.
     */
    async activate({ activateId }) {
      calls.push("activate");
      if (failActivation) throw new Error("activation transaction failed");
      const next = rows.get(activateId);
      if (next?.status === "active") return;
      if (next?.status !== "staged") return;

      const current = [...rows.values()].find((r) => r.logicalAssetId === next.logicalAssetId
        && r.variantKey === next.variantKey && r.status === "active");
      if (current) {
        if (current.revision > next.revision) throw new Error("catalog_activation_not_forward");
        rows.set(current.id, { ...current, status: "retired" });
      }
      rows.set(activateId, { ...next, status: "active", activatedAt: "2026-08-19T00:01:00Z" });
    },
    async markFailed(id) {
      calls.push("markFailed");
      const row = rows.get(id);
      if (row?.status === "staged") rows.set(id, { ...row, status: "failed" });
    },
    async restageFailed(id, sha256) {
      calls.push("restageFailed");
      const row = rows.get(id);
      if (!row) throw new Error("catalog_object_not_found");
      if (row.sha256 !== sha256) throw new Error("catalog_object_hash_mismatch");
      if (row.status !== "failed") throw new Error("catalog_object_not_failed");
      rows.set(id, { ...row, status: "staged" });
    },
    async countReferences(gcsObjectKey) {
      return [...rows.values()].filter((r) => r.gcsObjectKey === gcsObjectKey && r.status !== "failed").length;
    },
  } satisfies RegistryStore;

  return { store, rows, calls, setFailActivation: (value: boolean) => { failActivation = value; } };
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

  /** 같은 내용 + 요청 preview 없음 → 완전한 no-op. */
  it("active + 동일 canonical + preview 없음이면 아무것도 하지 않는다", async () => {
    const { store, calls } = fakeStore();
    await publishThemeAsset(input(), { store, uploadCatalogObject: uploader, previewBucket: null });
    calls.length = 0;
    const upload = vi.fn(async () => ({ generation: "17", sizeBytes: 24 }));

    const result = await publishThemeAsset(input(), { store, uploadCatalogObject: upload, previewBucket: null });

    expect(result.status).toBe("already-active");
    expect(upload).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  /**
   * 내용 비교가 상태 판단보다 먼저다. active를 이유로 통과시키면 호출자는 새 내용이 반영됐다고
   * 오인하지만 객체는 그대로다.
   */
  it("active + 다른 canonical은 거부한다", async () => {
    const { store } = fakeStore();
    const deps = { store, uploadCatalogObject: uploader, previewBucket: null };
    await publishThemeAsset(input(), deps);

    await expect(publishThemeAsset(
      input({ canonical: { fileName: "other@3x.png", mimeType: "image/png", bytes: pngBytes(77, 77) } }),
      deps,
    )).rejects.toThrow(CatalogPublishError);
  });

  /**
   * 최초 게시 때 R2 바인딩이 없었으면 preview가 비어 있다. 여기서 바로 돌려보내면 영영 복구할 수
   * 없으므로, canonical 업로드는 건너뛰되 누락된 preview는 채운다.
   */
  it("active + 누락된 preview를 재게시로 복구한다", async () => {
    const { store, rows } = fakeStore();
    const previews = [{ presetKey: "card", bytes: new Uint8Array([1, 2]), contentType: "image/webp" as const }];

    // 1차: 바인딩이 없어 preview를 건너뛴다.
    const first = await publishThemeAsset(input({ previews }), { store, uploadCatalogObject: uploader, previewBucket: null });
    expect(first.previewsSkipped).toBe(true);
    expect([...rows.values()][0].r2Previews).toEqual({});

    // 2차: 바인딩이 생긴 뒤 같은 내용으로 재게시.
    const upload = vi.fn(async () => ({ generation: "17", sizeBytes: 24 }));
    const second = await publishThemeAsset(input({ previews }), { store, uploadCatalogObject: upload, previewBucket: fakeBucket() });

    expect(second.status).toBe("already-active");
    expect(upload).not.toHaveBeenCalled(); // canonical은 다시 올리지 않는다
    expect(second.record.r2Previews.card.objectKey).toMatch(/^preview\/v1\/asset\//);
  });

  /** 새 preset을 더해도 기존 preset은 보존한다. */
  it("active + 새 preset은 기존 것을 보존하며 merge한다", async () => {
    const { store } = fakeStore();
    const deps = { store, uploadCatalogObject: uploader, previewBucket: fakeBucket() };
    await publishThemeAsset(input({ previews: [{ presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" }] }), deps);

    const result = await publishThemeAsset(input({
      previews: [
        { presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" },
        { presetKey: "wide", bytes: new Uint8Array([2, 2]), contentType: "image/webp" },
      ],
    }), deps);

    expect(Object.keys(result.record.r2Previews).sort()).toEqual(["card", "wide"]);
  });

  // revision이 곧 내용의 이름이다. 같은 번호로 다른 그림이 들어오면 하류 캐시가 어긋난다.
  it("staged revision도 다른 바이트로 덮어쓰지 않는다", async () => {
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
    // 기본 용도는 추천 에셋이라 `asset/` 아래로 간다.
    expect(result.record.r2Previews.card.objectKey).toMatch(/^preview\/v1\/asset\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
    expect(calls).toEqual(["insertStaged", "setPreviews", "activate"]);
  });

  // 템플릿 preview는 다른 prefix로 간다. 피커 썸네일과 바이트가 같아질 일이 없어 섞을 이유가 없다.
  it("previewPurpose가 template이면 template prefix로 올린다", async () => {
    const { store } = fakeStore();
    const result = await publishThemeAsset(
      input({ previews: [{ presetKey: "card", bytes: new Uint8Array([9]), contentType: "image/webp" }], previewPurpose: "template" }),
      { store, uploadCatalogObject: uploader, previewBucket: fakeBucket() },
    );
    expect(result.record.r2Previews.card.objectKey).toMatch(/^preview\/v1\/template\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/);
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

  /**
   * content-addressed 키의 목적이 "같은 바이트는 하나의 객체"다. 서로 다른 논리 에셋이 같은
   * 객체를 가리키는 것이 정상 경로이고, 실측에서도 논리 에셋 126개가 객체 90개를 공유한다.
   */
  it("서로 다른 논리 에셋이 같은 GCS 객체를 공유할 수 있다", async () => {
    const { store, rows } = fakeStore();
    const bytes = pngBytes(64, 64);
    const deps = { store, uploadCatalogObject: uploader, previewBucket: null };

    const first = await publishThemeAsset(input({ logicalAssetId: "admin:a", canonical: { fileName: "x@3x.png", mimeType: "image/png", bytes } }), deps);
    const second = await publishThemeAsset(input({ logicalAssetId: "tpl:b", canonical: { fileName: "x@3x.png", mimeType: "image/png", bytes } }), deps);

    expect(second.record.gcsObjectKey).toBe(first.record.gcsObjectKey);
    expect(second.record.status).toBe("active");
    expect([...rows.values()].filter((row) => row.status === "active")).toHaveLength(2);
  });

  /**
   * active 전환이 실패해도 기존 active가 남아야 한다. 두 UPDATE를 따로 보내면 이전 것만 내려간
   * 채로 끊겨 active가 하나도 없는 창이 생긴다 — 그때 export가 에셋을 해석하지 못한다.
   */
  it("활성 전환이 실패해도 기존 active revision이 남는다", async () => {
    const { store, rows, setFailActivation } = fakeStore();
    const deps = { store, uploadCatalogObject: uploader, previewBucket: null };
    await publishThemeAsset(input({ revision: 1 }), deps);

    setFailActivation(true);
    await expect(publishThemeAsset(
      input({ revision: 2, canonical: { fileName: "b@3x.png", mimeType: "image/png", bytes: pngBytes(50, 50) } }),
      deps,
    )).rejects.toThrow(CatalogPublishFailure);

    const byRevision = Object.fromEntries([...rows.values()].map((row) => [row.revision, row.status]));
    expect(byRevision).toEqual({ 1: "active", 2: "failed" });
  });

  /**
   * R2 일시 오류로 failed가 됐다고 revision을 올릴 이유는 없다. revision은 내용의 이름이라
   * 같은 바이트는 같은 번호로 다시 시도해야 한다.
   */
  it("R2 일시 실패 뒤 같은 revision으로 재시도해 성공한다", async () => {
    const { store, rows, calls } = fakeStore();
    const previews = [{ presetKey: "card", bytes: new Uint8Array([1, 2]), contentType: "image/webp" as const }];
    const broken = fakeBucket({ put: async () => { throw new Error("r2 down"); } });

    await expect(publishThemeAsset(input({ previews }), { store, uploadCatalogObject: uploader, previewBucket: broken }))
      .rejects.toThrow(CatalogPublishFailure);
    expect([...rows.values()][0].status).toBe("failed");

    calls.length = 0;
    const retried = await publishThemeAsset(input({ previews }), { store, uploadCatalogObject: uploader, previewBucket: fakeBucket() });

    expect(retried.status).toBe("published");
    expect(retried.record.revision).toBe(1);
    expect(rows.size).toBe(1);
    expect(calls).toContain("restageFailed");
    expect(calls).not.toContain("insertStaged");
  });

  it("failed revision을 다른 바이트로 덮어쓰지 못한다", async () => {
    const { store } = fakeStore();
    const previews = [{ presetKey: "card", bytes: new Uint8Array([1]), contentType: "image/webp" as const }];
    const broken = fakeBucket({ put: async () => { throw new Error("r2 down"); } });
    await expect(publishThemeAsset(input({ previews }), { store, uploadCatalogObject: uploader, previewBucket: broken }))
      .rejects.toThrow(CatalogPublishFailure);

    await expect(publishThemeAsset(
      input({ canonical: { fileName: "other@3x.png", mimeType: "image/png", bytes: pngBytes(11, 11) } }),
      { store, uploadCatalogObject: uploader, previewBucket: null },
    )).rejects.toThrow(CatalogPublishError);
  });

  // retired는 이미 다음 revision에 자리를 넘긴 상태다. 되돌리는 것은 publish가 아니라 rollback의 일이다.
  it("retired revision은 재시도 대상이 아니다", async () => {
    const { store, rows } = fakeStore();
    const deps = { store, uploadCatalogObject: uploader, previewBucket: null };
    await publishThemeAsset(input({ revision: 1 }), deps);
    await publishThemeAsset(input({ revision: 2, canonical: { fileName: "b@3x.png", mimeType: "image/png", bytes: pngBytes(50, 50) } }), deps);
    expect([...rows.values()].find((row) => row.revision === 1)?.status).toBe("retired");

    await expect(publishThemeAsset(input({ revision: 1 }), deps)).rejects.toThrow(CatalogPublishError);
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

/**
 * 두 게시가 활성화 전에 같은 active를 읽는 경합.
 *
 * 예전 RPC는 **호출자가 지목한** 행을 내렸다. 먼저 커밋한 쪽이 그 행을 이미 retired로 만들어
 * 두면, 나중 쪽은 0행을 갱신하고 지나간 뒤 partial unique 인덱스에 걸려 실패했다. 기존 active가
 * 사라지지는 않지만 **최신 게시가 죽는다.** 이제 지목받은 행이 아니라 지금 실제로 active인 행을
 * 내린다. `supabase/migrations/20260821041500_*.sql`과 같은 규칙이다.
 */
describe("동시 활성화", () => {
  it("먼저 커밋한 게시가 active를 바꿔 놔도 최신 revision이 활성화된다", async () => {
    const { store, rows } = fakeStore();

    await publishThemeAsset(input({ revision: 1 }), { store, uploadCatalogObject: uploader, previewBucket: null });
    // rev2·rev3 모두 rev1을 active로 보고 출발한 상황을 만든다.
    await publishThemeAsset(input({ revision: 2, canonical: { fileName: "main@3x.png", mimeType: "image/png", bytes: pngBytes(101, 200) } }), {
      store, uploadCatalogObject: uploader, previewBucket: null,
    });
    await publishThemeAsset(input({ revision: 3, canonical: { fileName: "main@3x.png", mimeType: "image/png", bytes: pngBytes(102, 201) } }), {
      store, uploadCatalogObject: uploader, previewBucket: null,
    });

    const byRevision = Object.fromEntries([...rows.values()].map((row) => [row.revision, row.status]));
    expect(byRevision).toEqual({ 1: "retired", 2: "retired", 3: "active" });
  });

  it("오래된 revision은 최신 active를 덮지 못한다", async () => {
    const { store, rows } = fakeStore();
    await publishThemeAsset(input({ revision: 5 }), { store, uploadCatalogObject: uploader, previewBucket: null });

    await expect(publishThemeAsset(
      input({ revision: 4, canonical: { fileName: "main@3x.png", mimeType: "image/png", bytes: pngBytes(103, 202) } }),
      { store, uploadCatalogObject: uploader, previewBucket: null },
    )).rejects.toThrow();

    expect([...rows.values()].find((row) => row.revision === 5)?.status).toBe("active");
  });
});
