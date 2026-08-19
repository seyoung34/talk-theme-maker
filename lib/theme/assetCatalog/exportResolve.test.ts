import { describe, expect, it } from "vitest";
import {
  collectCatalogSelections,
  resolveCatalogManifest,
  toRegistryLookupKeys,
  type ExportManifestSourceItem,
} from "@/lib/theme/assetCatalog/exportResolve";
import { mapThemeAssetObjectRow, maxReferencedAssetBytes, ThemeAssetRegistryError } from "@/lib/theme/assetCatalog/registry";

function record(overrides: Record<string, unknown> = {}) {
  return mapThemeAssetObjectRow({
    id: "obj-1",
    logical_asset_id: "admin:a",
    revision: 2,
    variant_key: "canonical",
    status: "active",
    gcs_object_key: "catalog/v1/ab/" + "a".repeat(64) + ".png",
    gcs_generation: "17",
    sha256: "a".repeat(64),
    size_bytes: 1024,
    mime_type: "image/png",
    file_name: "main@3x.png",
    source_scale: 3,
    width: 1125,
    height: 2436,
    png_signature_verified: true,
    r2_previews: {},
    created_at: "2026-08-19T00:00:00Z",
    activated_at: "2026-08-19T00:01:00Z",
    ...overrides,
  });
}

const selection = { kind: "catalog", assetId: "admin:a", revision: 2, variantKey: "canonical" };

function manifest(...items: ExportManifestSourceItem[]) {
  return items;
}

describe("collectCatalogSelections", () => {
  it("catalog 항목만 골라낸다", () => {
    const { selections, failures } = collectCatalogSelections(manifest(
      { path: "a.png", field: "file-0" },
      { path: "b.png", serverAsset: "/template-assets/x.png" },
      { path: "c.png", catalogAsset: selection },
    ));
    expect(selections).toHaveLength(1);
    expect(selections[0].path).toBe("c.png");
    expect(failures).toHaveLength(0);
  });

  // 깨진 payload는 registry 왕복 전에 막는다.
  it("형식이 깨진 선택을 조회 전에 실패로 남긴다", () => {
    const { selections, failures } = collectCatalogSelections(manifest(
      { path: "a.png", catalogAsset: { kind: "catalog", assetId: "", revision: 1, variantKey: "canonical" } },
      { path: "b.png", catalogAsset: "nope" },
    ));
    expect(selections).toHaveLength(0);
    expect(failures.map((f) => f.reason)).toEqual(["invalid_selection", "invalid_selection"]);
  });
});

describe("toRegistryLookupKeys", () => {
  it("같은 자산을 여러 경로가 써도 한 번만 조회한다", () => {
    const keys = toRegistryLookupKeys([
      { selection: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } },
      { selection: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } },
      { selection: { kind: "catalog", assetId: "tpl:b", revision: 1, variantKey: "ios" } },
    ]);
    expect(keys).toEqual([
      { logicalAssetId: "admin:a", variantKey: "canonical" },
      { logicalAssetId: "tpl:b", variantKey: "ios" },
    ]);
  });
});

describe("resolveCatalogManifest", () => {
  it("catalog 항목을 GCS 좌표로 바꾸고 나머지는 그대로 통과시킨다", () => {
    const result = resolveCatalogManifest({
      manifest: manifest(
        { path: "a.png", field: "file-0" },
        { path: "b.png", catalogAsset: selection },
      ),
      records: [record()],
      uploadedInputBytes: 0,
    });

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].catalogObject.objectKey).toContain("catalog/v1/");
    expect(result.resolved[0].catalogObject.generation).toBe("17");
    expect(result.passthrough).toEqual([{ path: "a.png", field: "file-0" }]);
    expect(result.failures).toHaveLength(0);
  });

  /**
   * 브라우저가 bucket이나 object key를 끼워 넣어도 결과에 실리지 않는다. 그 값은 registry에서만 나온다.
   */
  it("client가 넣은 저장소 좌표를 무시한다", () => {
    const result = resolveCatalogManifest({
      manifest: manifest({ path: "b.png", catalogAsset: { ...selection, bucket: "attacker", objectKey: "../secret.png" } }),
      records: [record()],
      uploadedInputBytes: 0,
    });
    expect(result.resolved[0].catalogObject.objectKey).toBe(`catalog/v1/ab/${"a".repeat(64)}.png`);
    expect(JSON.stringify(result.resolved)).not.toContain("attacker");
  });

  /**
   * 조용히 최신 revision으로 바꿔 주지 않는다. 사용자가 편집기에서 보고 고른 그림과 결과물이
   * 달라지기 때문이다.
   */
  it("revision이 다르면 거절한다", () => {
    const result = resolveCatalogManifest({
      manifest: manifest({ path: "b.png", catalogAsset: { ...selection, revision: 1 } }),
      records: [record({ revision: 2 })],
      uploadedInputBytes: 0,
    });
    expect(result.resolved).toHaveLength(0);
    expect(result.failures[0].reason).toBe("revision_mismatch");
  });

  it("registry에 없으면 not_found다", () => {
    const result = resolveCatalogManifest({
      manifest: manifest({ path: "b.png", catalogAsset: selection }),
      records: [],
      uploadedInputBytes: 0,
    });
    expect(result.failures[0].reason).toBe("not_found");
  });

  it.each<[string, Record<string, unknown>]>([
    ["retired 상태", { status: "retired" }],
    ["PNG 미검증", { png_signature_verified: false }],
    ["PNG가 아닌 MIME", { mime_type: "image/webp" }],
  ])("%s는 not_exportable이다", (_label, overrides) => {
    const result = resolveCatalogManifest({
      manifest: manifest({ path: "b.png", catalogAsset: selection }),
      records: [record(overrides)],
      uploadedInputBytes: 0,
    });
    expect(result.failures[0].reason).toBe("not_exportable");
  });

  /**
   * 같은 객체를 여러 경로가 쓰는 경우가 흔하다(Android 슬롯 89개 중 23개가 다중 경로).
   * package 크기는 경로마다 늘지만 실제 GCS read는 한 번이다.
   */
  it("경로마다 합산하되 실제 read는 dedupe해 센다", () => {
    const result = resolveCatalogManifest({
      manifest: manifest(
        { path: "a.png", catalogAsset: selection },
        { path: "b.png", catalogAsset: selection },
      ),
      records: [record()],
      uploadedInputBytes: 0,
    });
    expect(result.resolved).toHaveLength(2);
    expect(result.totals).toEqual({
      referencedAssetBytes: 2048,
      uniqueReferencedAssetBytes: 1024,
      referencedAssetFileCount: 2,
    });
  });

  // 참조 바이트는 multipart 밖이라 기존 50MiB 검사에 안 잡힌다. 여기서 따로 막지 않으면
  // Worker는 통과하고 Cloud Run에서만 터진다.
  it("참조 바이트 상한을 넘으면 거부한다", () => {
    expect(() => resolveCatalogManifest({
      manifest: manifest({ path: "a.png", catalogAsset: selection }),
      records: [record({ size_bytes: maxReferencedAssetBytes })],
      uploadedInputBytes: 1,
    })).toThrow(ThemeAssetRegistryError);
  });

  it("catalog 항목이 없으면 전부 통과시킨다", () => {
    const items = manifest({ path: "a.png", field: "file-0" }, { path: "b.png", serverAsset: "/template-assets/x.png" });
    const result = resolveCatalogManifest({ manifest: items, records: [], uploadedInputBytes: 100 });
    expect(result.resolved).toHaveLength(0);
    expect(result.passthrough).toEqual(items);
    expect(result.totals.referencedAssetBytes).toBe(0);
  });
});
