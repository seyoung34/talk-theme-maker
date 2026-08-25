import { describe, expect, it } from "vitest";
import { parseCatalogTransform, validateCatalogTransform } from "@/lib/theme/export/catalogTransform";

const source = {
  fileName: "bubble@3x.png",
  mimeType: "image/png",
  sourceScale: 3 as const,
  width: 120,
  height: 80,
};

describe("catalog transform contract", () => {
  it("Android raster descriptor를 허용하고 target dimension을 검증한다", () => {
    const transform = parseCatalogTransform({
      kind: "android-image",
      outputFormat: "png",
      fit: "cover",
      targetDimensions: { width: 432, height: 432 },
    });

    expect(validateCatalogTransform({
      platform: "android",
      path: "src/main/res/mipmap-xxxhdpi/ic_launcher_background.png",
      source,
      transform,
    })).toEqual({ valid: true, transform });

    expect(validateCatalogTransform({
      platform: "android",
      path: "src/main/res/mipmap-xxxhdpi/ic_launcher_background.png",
      source,
      transform: { ...transform, targetDimensions: { width: 9000, height: 9000 } },
    })).toEqual({ valid: false, reason: "invalid_descriptor" });
  });

  it("Android nine-patch descriptor를 허용한다", () => {
    const transform = parseCatalogTransform({
      kind: "android-nine-patch",
      outputFormat: "png",
      ninePatch: {
        geometry: {
          stretch: { x: 60, y: 40 },
          contentInsets: { top: 16, right: 16, bottom: 12, left: 16 },
        },
      },
    });

    expect(validateCatalogTransform({
      platform: "android",
      path: "src/main/theme/drawable-xxhdpi/chat.9.png",
      source,
      transform,
    })).toEqual({ valid: true, transform });
  });

  it("iOS scale mismatch descriptor는 target path와 registry dimension을 함께 검증한다", () => {
    const transform = parseCatalogTransform({
      kind: "ios-image",
      outputFormat: "png",
      sourceScale: 3,
      targetScale: 2,
      sourceDimensions: { width: 120, height: 80 },
    });

    expect(validateCatalogTransform({
      platform: "ios",
      path: "Images/bubble@2x.png",
      source,
      transform,
    })).toEqual({ valid: true, transform });

    expect(validateCatalogTransform({
      platform: "ios",
      path: "Images/bubble@3x.png",
      source,
      transform,
    })).toEqual({ valid: false, reason: "path_mismatch" });
  });

  it("iOS Android nine-patch 원본은 border 제거와 normalized dimension을 요구한다", () => {
    const ninePatchSource = { ...source, fileName: "bubble.9.png", width: 122, height: 82 };
    const transform = parseCatalogTransform({
      kind: "ios-image",
      outputFormat: "png",
      sourceScale: 3,
      targetScale: 3,
      stripNinePatchBorder: true,
      sourceDimensions: { width: 120, height: 80 },
    });

    expect(validateCatalogTransform({
      platform: "ios",
      path: "Images/bubble@3x.png",
      source: ninePatchSource,
      transform,
    })).toEqual({ valid: true, transform });
  });

  it("플랫폼 변환과 맞지 않는 descriptor를 fail-closed한다", () => {
    expect(validateCatalogTransform({
      platform: "ios",
      path: "Images/bubble@3x.png",
      source,
      transform: { kind: "android-nine-patch", outputFormat: "png" },
    })).toEqual({ valid: false, reason: "platform_mismatch" });
  });
});
