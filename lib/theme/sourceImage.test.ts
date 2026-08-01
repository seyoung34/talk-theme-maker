import { describe, expect, it } from "vitest";
import {
  detectThemeImageSourceFormat,
  getAndroidNinePatchInnerSize,
  isAndroidNinePatchSourceName,
} from "@/lib/theme/sourceImage";

describe("detectThemeImageSourceFormat", () => {
  it("파일명과 signed URL의 Android 9-patch source를 판별한다", () => {
    expect(detectThemeImageSourceFormat("bubble.9.png")).toBe("android-nine-patch");
    expect(detectThemeImageSourceFormat("https://storage.test/bubble.9.PNG?token=secret#preview")).toBe("android-nine-patch");
    expect(isAndroidNinePatchSourceName("https://storage.test/bubble%2E9%2Epng?token=secret")).toBe(true);
  });

  it("일반 PNG와 비어 있는 이름은 plain으로 판별한다", () => {
    expect(detectThemeImageSourceFormat("bubble.png")).toBe("plain");
    expect(detectThemeImageSourceFormat(undefined)).toBe("plain");
  });
});

describe("getAndroidNinePatchInnerSize", () => {
  it("네 변의 1px marker border를 제외한 artwork 크기를 반환한다", () => {
    expect(getAndroidNinePatchInnerSize(202, 102)).toEqual({ width: 200, height: 100 });
  });

  it("marker border를 가질 수 없는 크기는 거부한다", () => {
    expect(() => getAndroidNinePatchInnerSize(2, 10)).toThrow(/3px보다 커야/);
  });
});
