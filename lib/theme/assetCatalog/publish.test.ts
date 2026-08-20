import { describe, expect, it } from "vitest";
import {
  catalogObjectKey,
  CatalogPublishError,
  collectOrphanCandidates,
  defaultCatalogSourceScale,
  describeCatalogSource,
  planCatalogActivation,
  planCatalogPublication,
  sha256Hex,
} from "@/lib/theme/assetCatalog/publish";
import { maxCatalogObjectBytes } from "@/lib/theme/assetCatalog/registry";

/** width/height를 IHDR에 담은 최소 PNG 헤더. 픽셀 데이터는 필요 없다. */
function pngBytes(width: number, height: number, extra = 0) {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function source(overrides: Partial<{ fileName: string; mimeType: string; bytes: Uint8Array }> = {}) {
  return { fileName: "pastel-glass-main@3x.png", mimeType: "image/png", bytes: pngBytes(1125, 2436), ...overrides };
}

describe("describeCatalogSource", () => {
  it("PNG 헤더에서 크기를 읽고 registry 값을 채운다", () => {
    expect(describeCatalogSource(source())).toEqual({
      fileName: "pastel-glass-main@3x.png",
      mimeType: "image/png",
      sizeBytes: 24,
      width: 1125,
      height: 2436,
      sourceScale: 3,
      pngSignatureVerified: true,
    });
  });

  it("파일명의 @2x를 배율로 읽는다", () => {
    expect(describeCatalogSource(source({ fileName: "icon@2x.png" })).sourceScale).toBe(2);
  });

  // iOS export의 getIosSourceScale()이 단서가 없을 때 3으로 떨어지는 것과 같아야 한다.
  it("배율 접미사가 없으면 기본값을 쓴다", () => {
    expect(describeCatalogSource(source({ fileName: "icon.png" })).sourceScale).toBe(defaultCatalogSourceScale);
    expect(defaultCatalogSourceScale).toBe(3);
  });

  it("PNG가 아닌 MIME을 거부한다", () => {
    expect(() => describeCatalogSource(source({ mimeType: "image/webp" }))).toThrow(CatalogPublishError);
  });

  it("서명이 PNG가 아니면 거부한다", () => {
    expect(() => describeCatalogSource(source({ bytes: new Uint8Array(24) }))).toThrow(CatalogPublishError);
  });

  // 서명만 맞고 IHDR이 어긋난 파일이 통과하면 registry의 크기가 틀리고, 그 값을 믿는 export가 함께 틀린다.
  it("서명은 맞지만 IHDR이 손상되면 거부한다", () => {
    const bytes = pngBytes(10, 10);
    new DataView(bytes.buffer).setUint32(12, 0x49444154); // "IDAT"
    expect(() => describeCatalogSource(source({ bytes }))).toThrow(CatalogPublishError);
  });

  it("크기가 0인 이미지를 거부한다", () => {
    expect(() => describeCatalogSource(source({ bytes: pngBytes(0, 100) }))).toThrow(CatalogPublishError);
  });

  it("빈 바이트와 20MiB 초과를 거부한다", () => {
    expect(() => describeCatalogSource(source({ bytes: new Uint8Array(0) }))).toThrow(CatalogPublishError);
    const tooLarge = pngBytes(10, 10, maxCatalogObjectBytes);
    expect(() => describeCatalogSource(source({ bytes: tooLarge }))).toThrow(CatalogPublishError);
  });

  it("경로 구분자가 섞인 파일명을 거부한다", () => {
    expect(() => describeCatalogSource(source({ fileName: "../evil.png" }))).toThrow(CatalogPublishError);
    expect(() => describeCatalogSource(source({ fileName: "a/b.png" }))).toThrow(CatalogPublishError);
    expect(() => describeCatalogSource(source({ fileName: "  " }))).toThrow(CatalogPublishError);
  });
});

describe("content-addressed key", () => {
  it("sha256을 2자 샤딩 경로로 만든다", () => {
    const sha = "ab".padEnd(64, "c");
    expect(catalogObjectKey(sha)).toBe(`catalog/v1/ab/${sha}.png`);
  });

  it("sha256 형식이 아니면 거부한다", () => {
    expect(() => catalogObjectKey("nope")).toThrow(CatalogPublishError);
    expect(() => catalogObjectKey("A".repeat(64))).toThrow(CatalogPublishError);
  });

  it("같은 바이트는 같은 해시를 낸다", async () => {
    const a = await sha256Hex(pngBytes(10, 10));
    const b = await sha256Hex(pngBytes(10, 10));
    const c = await sha256Hex(pngBytes(11, 10));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("planCatalogPublication", () => {
  /**
   * Phase 0 인벤토리에서 같은 그림이 admin-assets와 여러 system-templates 아래 최대 14본까지
   * 중복돼 있었다. content-addressed key는 그 사본들을 한 객체로 접는다.
   */
  it("같은 바이트를 다른 논리 에셋이 올려도 같은 객체 키를 쓴다", async () => {
    const bytes = pngBytes(64, 64);
    const first = await planCatalogPublication({ logicalAssetId: "a", revision: 1, variantKey: "ios", source: source({ bytes }) });
    const second = await planCatalogPublication({ logicalAssetId: "b", revision: 7, variantKey: "android", source: source({ bytes }) });
    expect(second.objectKey).toBe(first.objectKey);
  });

  it("이미 올라간 객체는 업로드를 건너뛴다", async () => {
    const plan = await planCatalogPublication({ logicalAssetId: "a", revision: 1, variantKey: "ios", source: source() });
    expect(plan.uploadRequired).toBe(true);

    const retry = await planCatalogPublication({
      logicalAssetId: "a",
      revision: 1,
      variantKey: "ios",
      source: source(),
      existingObjectKeys: new Set([plan.objectKey]),
    });
    expect(retry.uploadRequired).toBe(false);
    expect(retry.sha256).toBe(plan.sha256);
  });
});

describe("planCatalogActivation", () => {
  const staged = { id: "new", logicalAssetId: "a", revision: 2, variantKey: "ios", status: "staged" as const };

  it("첫 게시는 내릴 대상이 없다", () => {
    expect(planCatalogActivation({ staged })).toEqual({ activateId: "new" });
  });

  it("기존 active를 함께 retire한다", () => {
    expect(planCatalogActivation({ staged, currentActive: { id: "old", revision: 1, status: "active" } })).toEqual({
      activateId: "new",
      retireId: "old",
    });
  });

  // 재시도가 몇 번 돌아도 결과가 같아야 한다.
  it("이미 active면 아무 일도 하지 않는다", () => {
    expect(planCatalogActivation({ staged: { ...staged, status: "active" } })).toBeNull();
  });

  it("staged가 아닌 상태에서 활성화하지 않는다", () => {
    expect(() => planCatalogActivation({ staged: { ...staged, status: "failed" } })).toThrow(CatalogPublishError);
    expect(() => planCatalogActivation({ staged: { ...staged, status: "retired" } })).toThrow(CatalogPublishError);
  });

  // 이전 revision으로 되돌리는 것은 publish가 아니라 rollback의 일이다.
  it("현재 active보다 낮거나 같은 revision을 올리지 않는다", () => {
    expect(() => planCatalogActivation({ staged, currentActive: { id: "old", revision: 2, status: "active" } })).toThrow(CatalogPublishError);
    expect(() => planCatalogActivation({ staged, currentActive: { id: "old", revision: 3, status: "active" } })).toThrow(CatalogPublishError);
  });
});

describe("collectOrphanCandidates", () => {
  /**
   * content-addressed라 다른 레코드가 같은 키를 참조할 수 있다. 실패했다고 바로 지우면 살아 있는
   * 에셋을 깨뜨린다.
   */
  it("아직 참조되는 객체는 고아로 보지 않는다", () => {
    expect(collectOrphanCandidates({
      uploadedObjectKeys: ["catalog/v1/aa/a.png", "catalog/v1/bb/b.png"],
      referencedObjectKeys: new Set(["catalog/v1/aa/a.png"]),
    })).toEqual(["catalog/v1/bb/b.png"]);
  });

  it("중복 업로드 키를 한 번만 보고한다", () => {
    expect(collectOrphanCandidates({
      uploadedObjectKeys: ["catalog/v1/bb/b.png", "catalog/v1/bb/b.png"],
      referencedObjectKeys: new Set(),
    })).toEqual(["catalog/v1/bb/b.png"]);
  });
});
