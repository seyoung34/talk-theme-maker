import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertCatalogObjectKey,
  CatalogReadError,
  createCatalogReader,
  isCatalogManifestItem,
  parseGcsUri,
  type CatalogObjectRef,
} from "@/lib/theme/export/catalogSource";

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function refFor(bytes: Uint8Array, overrides: Partial<CatalogObjectRef> = {}): CatalogObjectRef {
  const sha = sha256Hex(bytes);
  return {
    objectKey: `catalog/v1/${sha.slice(0, 2)}/${sha}.png`,
    generation: "17",
    sha256: sha,
    sizeBytes: bytes.byteLength,
    mimeType: "image/png",
    ...overrides,
  };
}

describe("assertCatalogObjectKey", () => {
  it("catalog/v1 밖과 경로 탈출을 거부한다", () => {
    expect(assertCatalogObjectKey("catalog/v1/ab/x.png")).toBe("catalog/v1/ab/x.png");
    expect(() => assertCatalogObjectKey("preview/v1/ab/x.webp")).toThrow(CatalogReadError);
    expect(() => assertCatalogObjectKey("catalog/v1/../secret.png")).toThrow(CatalogReadError);
    expect(() => assertCatalogObjectKey("catalog/v1//x.png")).toThrow(CatalogReadError);
    expect(() => assertCatalogObjectKey("catalog/v1/a\\b.png")).toThrow(CatalogReadError);
  });
});

describe("isCatalogManifestItem", () => {
  it("필수 필드가 모두 있어야 통과한다", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(isCatalogManifestItem({ path: "a.png", catalogObject: refFor(bytes) })).toBe(true);
    expect(isCatalogManifestItem({ path: "a.png", field: "file-0" })).toBe(false);
    expect(isCatalogManifestItem({ path: "a.png", catalogObject: { objectKey: "k" } })).toBe(false);
    expect(isCatalogManifestItem({ catalogObject: refFor(bytes) })).toBe(false);
  });
});

describe("createCatalogReader", () => {
  const bytes = new Uint8Array([9, 8, 7, 6, 5]);

  it("generation을 고정해 읽는다", async () => {
    const download = vi.fn(async () => bytes);
    const read = await createCatalogReader({ download, sha256Hex });

    await read(refFor(bytes, { generation: "42" }));

    expect(download).toHaveBeenCalledWith({ objectKey: expect.stringContaining("catalog/v1/"), generation: "42" });
  });

  /**
   * 같은 객체를 여러 출력 경로가 쓰는 경우가 흔하다. job 안에서 한 번만 읽어야
   * GCS 요청과 시간이 경로 수에 비례하지 않는다.
   */
  it("같은 객체는 job 안에서 한 번만 읽는다", async () => {
    const download = vi.fn(async () => bytes);
    const read = await createCatalogReader({ download, sha256Hex });
    const ref = refFor(bytes);

    await read(ref);
    await read(ref);
    await read(ref);

    expect(download).toHaveBeenCalledTimes(1);
  });

  // generation이 다르면 다른 바이트다. 캐시를 공유하면 안 된다.
  it("generation이 다르면 따로 읽는다", async () => {
    const download = vi.fn(async () => bytes);
    const read = await createCatalogReader({ download, sha256Hex });

    await read(refFor(bytes, { generation: "1" }));
    await read(refFor(bytes, { generation: "2" }));

    expect(download).toHaveBeenCalledTimes(2);
  });

  it("읽기 실패를 asset_source_missing으로 남긴다", async () => {
    const read = await createCatalogReader({
      download: async () => { throw new Error("404 no such object"); },
      sha256Hex,
    });
    await expect(read(refFor(bytes))).rejects.toMatchObject({ code: "asset_source_missing" });
  });

  /**
   * Worker가 registry에서 읽은 값과 실제 바이트가 다르면 그 자리에서 실패해야 한다.
   * 조용히 진행하면 사용자가 다른 그림이 든 테마를 받는다.
   */
  it("크기가 어긋나면 asset_hash_mismatch다", async () => {
    const read = await createCatalogReader({ download: async () => bytes, sha256Hex });
    await expect(read(refFor(bytes, { sizeBytes: 999 }))).rejects.toMatchObject({ code: "asset_hash_mismatch" });
  });

  it("내용이 어긋나면 asset_hash_mismatch다", async () => {
    const read = await createCatalogReader({ download: async () => new Uint8Array([1, 1, 1, 1, 1]), sha256Hex });
    await expect(read(refFor(bytes))).rejects.toMatchObject({ code: "asset_hash_mismatch" });
  });

  it("허용 prefix 밖 키는 읽기 전에 막는다", async () => {
    const download = vi.fn(async () => bytes);
    const read = await createCatalogReader({ download, sha256Hex });
    await expect(read(refFor(bytes, { objectKey: "../evil.png" }))).rejects.toMatchObject({ code: "asset_source_invalid" });
    expect(download).not.toHaveBeenCalled();
  });
});

describe("parseGcsUri", () => {
  it("bucket과 key를 나눈다", () => {
    expect(parseGcsUri("gs://kt-theme-asset-catalog/catalog/v1/ab/x.png")).toEqual({
      bucket: "kt-theme-asset-catalog",
      objectKey: "catalog/v1/ab/x.png",
    });
  });

  it("형식이 아니면 거부한다", () => {
    expect(() => parseGcsUri("https://example.com/x")).toThrow(CatalogReadError);
    expect(() => parseGcsUri("gs://bucket-only")).toThrow(CatalogReadError);
  });
});
