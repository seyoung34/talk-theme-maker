import { describe, expect, it } from "vitest";
import { AndroidExportRequestError, parseManifest, readAndroidBundleUpload } from "@/lib/theme/android/requestShared";
import { parseIosManifest } from "@/lib/theme/ios/requestShared";
import { IosExportRequestError } from "@/lib/theme/ios/packageValidation";

/**
 * 3트랙 에셋 저장소 계획의 Phase 0 golden fixture.
 *
 * export manifest는 브라우저·Worker·Builder가 공유하는 계약이다. 세 번째 browser source인
 * `catalogAsset`을 추가한 뒤에도 기존 입력과 source 상호 배타 규칙이 유지되는지 확인한다.
 * `catalogObject`는 Worker가 해석한 내부 manifest라 브라우저 입력으로 받지 않는다.
 */

const androidPath = "src/main/theme/drawable-xxhdpi/theme_main_bg.png";
const androidPath2 = "src/main/theme/drawable-xhdpi/theme_main_bg.png";
const serverAsset = "/template-assets/basic/android/theme_main_bg.png";

function androidManifest(items: unknown[]) {
  return () => parseManifest(JSON.stringify(items));
}

function iosManifest(items: unknown[]) {
  return () => parseIosManifest(JSON.stringify(items));
}

describe("manifest v1 계약 — Android", () => {
  it("field source를 통과시킨다", () => {
    expect(androidManifest([{ path: androidPath, field: "file-0" }])()).toEqual([{ path: androidPath, field: "file-0" }]);
  });

  it("serverAsset source를 통과시킨다", () => {
    expect(androidManifest([{ path: androidPath, serverAsset }])()).toEqual([{ path: androidPath, serverAsset }]);
  });

  it("field와 serverAsset을 동시에 가진 항목을 거부한다", () => {
    expect(androidManifest([{ path: androidPath, field: "file-0", serverAsset }])).toThrow(AndroidExportRequestError);
  });

  it("source가 하나도 없는 항목을 거부한다", () => {
    expect(androidManifest([{ path: androidPath }])).toThrow(AndroidExportRequestError);
  });

  it("catalogAsset selection을 받는다", () => {
    expect(androidManifest([{ path: androidPath, catalogAsset: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } }])()).toEqual([
      { path: androidPath, catalogAsset: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } },
    ]);
  });

  it("빈 manifest와 300개 초과를 거부한다", () => {
    expect(androidManifest([])).toThrow(AndroidExportRequestError);
    expect(androidManifest(Array.from({ length: 301 }, (_, i) => ({ path: `${androidPath}${i}`, field: `file-${i}` })))).toThrow(AndroidExportRequestError);
  });
});

describe("manifest v1 계약 — iOS", () => {
  it("field와 serverAsset source를 통과시킨다", () => {
    expect(iosManifest([{ path: "Images/a@3x.png", field: "file-0" }])()).toEqual([{ path: "Images/a@3x.png", field: "file-0" }]);
    expect(iosManifest([{ path: "Images/a@3x.png", serverAsset }])()).toEqual([{ path: "Images/a@3x.png", serverAsset }]);
  });

  it("source가 둘이거나 없는 항목을 거부한다", () => {
    expect(iosManifest([{ path: "Images/a@3x.png", field: "file-0", serverAsset }])).toThrow(IosExportRequestError);
    expect(iosManifest([{ path: "Images/a@3x.png" }])).toThrow(IosExportRequestError);
  });

  it("catalogAsset selection을 받는다", () => {
    expect(iosManifest([{ path: "Images/a@3x.png", catalogAsset: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } }])()).toEqual([
      { path: "Images/a@3x.png", catalogAsset: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" } },
    ]);
  });
});

describe("readAndroidBundleUpload — source별 바이트 회계", () => {
  function bundle(items: { path: string; field?: string; serverAsset?: string; catalogAsset?: unknown }[], files: Record<string, Uint8Array>) {
    const formData = new FormData();
    for (const [field, bytes] of Object.entries(files)) formData.append(field, new File([bytes as BlobPart], `${field}.png`));
    return readAndroidBundleUpload(formData, JSON.stringify(items));
  }

  it("serverAsset은 inputBytes에 잡히지 않는다", async () => {
    const result = await bundle([{ path: androidPath, serverAsset }], {});
    expect(result.files).toHaveLength(0);
    expect(result.inputBytes).toBe(0);
  });

  it("catalogAsset은 inputBytes와 multipart 파일에 잡히지 않는다", async () => {
    const result = await bundle([{
      path: androidPath,
      catalogAsset: { kind: "catalog", assetId: "admin:a", revision: 1, variantKey: "canonical" },
    }], {});
    expect(result.files).toHaveLength(0);
    expect(result.inputBytes).toBe(0);
  });

  /**
   * 같은 field를 두 경로가 공유하면 업로드 바이트는 한 번이지만 `inputBytes`는 경로마다 더해진다.
   * Phase 4의 `referencedAssetBytes`도 이 규칙을 따라야 catalog 전환 전후 수치를 비교할 수 있다.
   */
  it("공유 field의 바이트는 출력 경로마다 합산된다", async () => {
    const bytes = new Uint8Array(10);
    const result = await bundle(
      [
        { path: androidPath, field: "file-0" },
        { path: androidPath2, field: "file-0" },
      ],
      { "file-0": bytes },
    );
    expect(result.files).toHaveLength(1);
    expect(result.inputBytes).toBe(20);
  });

  it("중복 경로를 거부한다", async () => {
    await expect(bundle([{ path: androidPath, field: "file-0" }, { path: androidPath, field: "file-1" }], {
      "file-0": new Uint8Array(1),
      "file-1": new Uint8Array(1),
    })).rejects.toThrow(AndroidExportRequestError);
  });

  it("허용 목록 밖 경로와 상위 경로 탈출을 거부한다", async () => {
    await expect(bundle([{ path: "../evil.png", field: "file-0" }], { "file-0": new Uint8Array(1) })).rejects.toThrow(AndroidExportRequestError);
    await expect(bundle([{ path: "src/main/theme/drawable-xxhdpi/../../evil.png", field: "file-0" }], { "file-0": new Uint8Array(1) })).rejects.toThrow(AndroidExportRequestError);
  });

  it("template-assets 밖을 가리키는 serverAsset을 거부한다", async () => {
    await expect(bundle([{ path: androidPath, serverAsset: "/etc/passwd" }], {})).rejects.toThrow(AndroidExportRequestError);
    await expect(bundle([{ path: androidPath, serverAsset: "/template-assets/../secret.png" }], {})).rejects.toThrow(AndroidExportRequestError);
  });
});
