import { describe, expect, it } from "vitest";
import {
  accumulateReferencedAssetBytes,
  assertReferencedAssetBudget,
  catalogVariantKeyFor,
  isCatalogRecordExportable,
  mapThemeAssetObjectRow,
  maxCatalogObjectBytes,
  maxReferencedAssetBytes,
  parseCatalogAssetSelection,
  ThemeAssetRegistryError,
  toResolvedCatalogManifestItem,
} from "@/lib/theme/assetCatalog/registry";

const sha = "a".repeat(64);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "obj-1",
    logical_asset_id: "asset-1",
    revision: 2,
    variant_key: "ios",
    status: "active",
    gcs_object_key: "catalog/v1/ab/abcdef.png",
    gcs_generation: "1712345678",
    sha256: sha,
    size_bytes: 1024,
    mime_type: "image/png",
    file_name: "pastel-glass-main@3x.png",
    source_scale: 3,
    width: 1125,
    height: 2436,
    png_signature_verified: true,
    r2_previews: { card: { objectKey: "preview/v1/card.webp", sha256: "b".repeat(64) } },
    created_at: "2026-08-19T00:00:00Z",
    activated_at: "2026-08-19T00:01:00Z",
    ...overrides,
  };
}

describe("mapThemeAssetObjectRow", () => {
  it("정상 row를 도메인 레코드로 옮긴다", () => {
    const record = mapThemeAssetObjectRow(row());
    expect(record).toMatchObject({
      id: "obj-1",
      logicalAssetId: "asset-1",
      revision: 2,
      variantKey: "ios",
      status: "active",
      sourceScale: 3,
      width: 1125,
      height: 2436,
      pngSignatureVerified: true,
      activatedAt: "2026-08-19T00:01:00Z",
    });
    expect(record.r2Previews.card.objectKey).toBe("preview/v1/card.webp");
  });

  it("bigint가 문자열로 와도 숫자로 읽는다", () => {
    expect(mapThemeAssetObjectRow(row({ size_bytes: "2048" })).sizeBytes).toBe(2048);
  });

  it("activated_at 없는 active row를 거부한다", () => {
    expect(() => mapThemeAssetObjectRow(row({ activated_at: null }))).toThrow(ThemeAssetRegistryError);
  });

  it("staged row는 activated_at이 없어도 된다", () => {
    expect(mapThemeAssetObjectRow(row({ status: "staged", activated_at: null })).status).toBe("staged");
  });

  it("20MiB를 넘는 object를 거부한다", () => {
    expect(() => mapThemeAssetObjectRow(row({ size_bytes: maxCatalogObjectBytes + 1 }))).toThrow(ThemeAssetRegistryError);
  });

  // 이 네 값이 없으면 바이트를 내려받지 않고는 export 적용 가능성을 판정할 수 없다.
  it.each(["file_name", "source_scale", "width", "height"])("%s가 없으면 거부한다", (field) => {
    expect(() => mapThemeAssetObjectRow(row({ [field]: null }))).toThrow(ThemeAssetRegistryError);
  });

  it("sha256 형식이 아니면 거부한다", () => {
    expect(() => mapThemeAssetObjectRow(row({ sha256: "not-a-hash" }))).toThrow(ThemeAssetRegistryError);
    expect(() => mapThemeAssetObjectRow(row({ sha256: "A".repeat(64) }))).toThrow(ThemeAssetRegistryError);
  });

  it("허용되지 않은 status와 sourceScale을 거부한다", () => {
    expect(() => mapThemeAssetObjectRow(row({ status: "published" }))).toThrow(ThemeAssetRegistryError);
    expect(() => mapThemeAssetObjectRow(row({ source_scale: 4 }))).toThrow(ThemeAssetRegistryError);
  });
});

describe("parseCatalogAssetSelection", () => {
  it("논리 식별자만 받는다", () => {
    expect(parseCatalogAssetSelection({ kind: "catalog", assetId: "a", revision: 1, variantKey: "ios" })).toEqual({
      kind: "catalog",
      assetId: "a",
      revision: 1,
      variantKey: "ios",
    });
  });

  // 브라우저가 저장소 좌표를 직접 넘기지 못하게 한다. 넘겨도 결과에 실리지 않는다.
  it("bucket·objectKey 같은 추가 필드는 결과에 실리지 않는다", () => {
    const parsed = parseCatalogAssetSelection({
      kind: "catalog",
      assetId: "a",
      revision: 1,
      variantKey: "ios",
      bucket: "attacker-bucket",
      objectKey: "../../secret.png",
    });
    expect(parsed).toEqual({ kind: "catalog", assetId: "a", revision: 1, variantKey: "ios" });
  });

  it("잘못된 revision과 kind를 거부한다", () => {
    expect(() => parseCatalogAssetSelection({ kind: "catalog", assetId: "a", revision: 0, variantKey: "ios" })).toThrow(ThemeAssetRegistryError);
    expect(() => parseCatalogAssetSelection({ kind: "upload", assetId: "a", revision: 1, variantKey: "ios" })).toThrow(ThemeAssetRegistryError);
  });
});

describe("isCatalogRecordExportable", () => {
  it("active + PNG attestation일 때만 fast path를 허용한다", () => {
    expect(isCatalogRecordExportable(mapThemeAssetObjectRow(row()))).toBe(true);
    expect(isCatalogRecordExportable(mapThemeAssetObjectRow(row({ status: "retired" })))).toBe(false);
    expect(isCatalogRecordExportable(mapThemeAssetObjectRow(row({ png_signature_verified: false })))).toBe(false);
    expect(isCatalogRecordExportable(mapThemeAssetObjectRow(row({ mime_type: "image/webp" })))).toBe(false);
  });
});

describe("accumulateReferencedAssetBytes", () => {
  /**
   * 같은 object를 여러 경로가 쓰는 경우가 실제로 흔하다(Android 슬롯 89개 중 23개가 다중 경로).
   * 두 수치는 의미가 다르다 — 하나는 package 크기, 하나는 실제 GCS read다.
   */
  it("경로마다 합산하되 실제 read는 dedupe한다", () => {
    const totals = accumulateReferencedAssetBytes([
      { objectKey: "catalog/v1/a.png", sizeBytes: 100 },
      { objectKey: "catalog/v1/a.png", sizeBytes: 100 },
      { objectKey: "catalog/v1/b.png", sizeBytes: 50 },
    ]);
    expect(totals).toEqual({ referencedAssetBytes: 250, uniqueReferencedAssetBytes: 150, referencedAssetFileCount: 3 });
  });

  it("참조가 없으면 0이다", () => {
    expect(accumulateReferencedAssetBytes([])).toEqual({
      referencedAssetBytes: 0,
      uniqueReferencedAssetBytes: 0,
      referencedAssetFileCount: 0,
    });
  });
});

describe("assertReferencedAssetBudget", () => {
  it("상한 안에서는 통과한다", () => {
    expect(() => assertReferencedAssetBudget({ referencedAssetBytes: 1000, referencedAssetFileCount: 5, uploadedInputBytes: 1000 })).not.toThrow();
  });

  it("참조 합계가 200MiB를 넘으면 거부한다", () => {
    expect(() => assertReferencedAssetBudget({ referencedAssetBytes: maxReferencedAssetBytes + 1, referencedAssetFileCount: 5, uploadedInputBytes: 0 })).toThrow(ThemeAssetRegistryError);
  });

  // DB의 logical_input_bytes CHECK와 같은 규칙을 enqueue 전에 먼저 막는다.
  it("업로드와 참조의 합이 200MiB를 넘으면 거부한다", () => {
    expect(() => assertReferencedAssetBudget({ referencedAssetBytes: maxReferencedAssetBytes, referencedAssetFileCount: 5, uploadedInputBytes: 1 })).toThrow(ThemeAssetRegistryError);
  });

  it("manifest 300개를 넘으면 거부한다", () => {
    expect(() => assertReferencedAssetBudget({ referencedAssetBytes: 0, referencedAssetFileCount: 301, uploadedInputBytes: 0 })).toThrow(ThemeAssetRegistryError);
  });
});

describe("toResolvedCatalogManifestItem", () => {
  it("Builder가 필요한 값만 담고 bucket은 넣지 않는다", () => {
    const item = toResolvedCatalogManifestItem("Images/a@3x.png", mapThemeAssetObjectRow(row()));
    expect(item.path).toBe("Images/a@3x.png");
    expect(item.catalogObject).toEqual({
      objectKey: "catalog/v1/ab/abcdef.png",
      generation: "1712345678",
      sha256: sha,
      sizeBytes: 1024,
      mimeType: "image/png",
      fileName: "pastel-glass-main@3x.png",
      sourceScale: 3,
      width: 1125,
      height: 2436,
      pngSignatureVerified: true,
    });
    expect(JSON.stringify(item)).not.toContain("bucket");
  });
});

describe("catalogVariantKeyFor", () => {
  it("플랫폼별 variant 키를 준다", () => {
    expect(catalogVariantKeyFor("ios")).toBe("ios");
    expect(catalogVariantKeyFor("android")).toBe("android");
  });
});
