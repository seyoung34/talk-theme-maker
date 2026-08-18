import { describe, expect, it, vi } from "vitest";
import {
  assertPreviewObjectKey,
  getPreviewBucket,
  previewCacheControl,
  previewObjectKey,
  PreviewStorageError,
  putPreviewObject,
  type PreviewBucket,
} from "@/lib/theme/assetCatalog/r2Preview";

const sha = "ab".padEnd(64, "c");

function bucket(overrides: Partial<PreviewBucket> = {}): PreviewBucket {
  return {
    put: async () => ({ size: 0 }),
    head: async () => ({ size: 0 }),
    ...overrides,
  };
}

describe("previewObjectKey", () => {
  // 계획 §8.1이 ?v= cache busting을 금지하므로 내용이 바뀌면 키가 바뀌어야 한다.
  it("sha256을 담은 불변 키를 만든다", () => {
    expect(previewObjectKey(sha, "image/webp")).toBe(`preview/v1/ab/${sha}.webp`);
    expect(previewObjectKey(sha, "image/png")).toBe(`preview/v1/ab/${sha}.png`);
  });

  it("sha256 형식이 아니면 거부한다", () => {
    expect(() => previewObjectKey("nope", "image/webp")).toThrow(PreviewStorageError);
  });
});

describe("assertPreviewObjectKey", () => {
  it("preview/v1 밖과 경로 탈출을 거부한다", () => {
    expect(assertPreviewObjectKey(`preview/v1/ab/${sha}.webp`)).toBeTruthy();
    expect(() => assertPreviewObjectKey("catalog/v1/a.png")).toThrow(PreviewStorageError);
    expect(() => assertPreviewObjectKey("preview/v1/../a.webp")).toThrow(PreviewStorageError);
    expect(() => assertPreviewObjectKey("preview/v1//a.webp")).toThrow(PreviewStorageError);
  });
});

describe("putPreviewObject", () => {
  const objectKey = previewObjectKey(sha, "image/webp");

  it("불변 cache-control과 출처 metadata를 함께 쓴다", async () => {
    const puts: { key: string; options?: unknown }[] = [];
    const target = bucket({
      put: async (key, _value, options) => { puts.push({ key, options }); return { size: 12 }; },
      head: async () => ({ size: 12 }),
    });

    const result = await putPreviewObject({
      bucket: target, objectKey, bytes: new Uint8Array(12), contentType: "image/webp", sha256: sha, sourceRevision: 3,
    });

    expect(result).toEqual({ objectKey, sizeBytes: 12 });
    expect(puts[0].options).toEqual({
      httpMetadata: { contentType: "image/webp", cacheControl: previewCacheControl },
      customMetadata: { sha256: sha, sourceRevision: "3" },
    });
  });

  /**
   * put이 성공해도 확인한다. registry가 기록한 preview가 실제로 서빙 가능한지 보지 않으면
   * 갤러리 카드가 깨진 뒤에야 알게 된다.
   */
  it("업로드 뒤 HEAD로 확인하고, 없으면 실패한다", async () => {
    const target = bucket({ head: async () => null });
    await expect(putPreviewObject({
      bucket: target, objectKey, bytes: new Uint8Array(12), contentType: "image/webp", sha256: sha, sourceRevision: 1,
    })).rejects.toThrow(PreviewStorageError);
  });

  it("HEAD 크기가 어긋나면 실패한다", async () => {
    const target = bucket({ head: async () => ({ size: 99 }) });
    await expect(putPreviewObject({
      bucket: target, objectKey, bytes: new Uint8Array(12), contentType: "image/webp", sha256: sha, sourceRevision: 1,
    })).rejects.toThrow(PreviewStorageError);
  });

  it("put 실패를 저장소 오류로 감싼다", async () => {
    const target = bucket({ put: async () => { throw new Error("R2 down"); } });
    await expect(putPreviewObject({
      bucket: target, objectKey, bytes: new Uint8Array(12), contentType: "image/webp", sha256: sha, sourceRevision: 1,
    })).rejects.toThrow(PreviewStorageError);
  });

  it("허용 prefix 밖 키는 업로드 전에 막는다", async () => {
    const put = vi.fn(async () => ({ size: 0 }));
    await expect(putPreviewObject({
      bucket: bucket({ put }), objectKey: "../evil.webp", bytes: new Uint8Array(1), contentType: "image/webp", sha256: sha, sourceRevision: 1,
    })).rejects.toThrow(PreviewStorageError);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("getPreviewBucket", () => {
  /**
   * `next dev`와 테스트에는 Workers 컨텍스트가 없다. 호출부가 기존 Supabase 경로로 fallback해야
   * 하므로 예외가 아니라 null이어야 한다.
   */
  it("Workers 밖에서는 null을 준다", () => {
    expect(getPreviewBucket()).toBeNull();
  });
});
