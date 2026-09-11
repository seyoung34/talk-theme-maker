import { describe, expect, it } from "vitest";
import { getAndroidRasterPlan, isAndroidDerivedLauncherRole, readAndroidDensity } from "@/lib/theme/android/rasterPlan";

// 이 규칙은 브라우저 렌더링, Worker의 catalog transform 검증, Cloud Run Android 빌더가 함께
// 쓴다. 셋 중 하나만 달라지면 미리보기와 실제 APK가 어긋나므로 값 자체를 고정해 둔다.
describe("android raster plan", () => {
  it("reads the density from a drawable or mipmap path", () => {
    expect(readAndroidDensity("res/mipmap-xxhdpi/ic_launcher.png")).toBe("xxhdpi");
    expect(readAndroidDensity("res/drawable-hdpi/splash.png")).toBe("hdpi");
    expect(readAndroidDensity("res/drawable-land-xhdpi/splash.png")).toBe("xhdpi");
    expect(readAndroidDensity("res/drawable/no_density.png")).toBeUndefined();
  });

  it("sizes adaptive launcher layers by density", () => {
    expect(getAndroidRasterPlan({ role: "launcher_background" }, "res/mipmap-mdpi/bg.png")).toEqual({ width: 108, height: 108, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "launcher_background" }, "res/mipmap-xxxhdpi/bg.png")).toEqual({ width: 432, height: 432, mode: "cover" });
  });

  it("sizes legacy launcher icons by density", () => {
    expect(getAndroidRasterPlan({ role: "launcher_icon" }, "res/mipmap-mdpi/ic.png")).toEqual({ width: 48, height: 48, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "launcher_round" }, "res/mipmap-xxxhdpi/ic.png")).toEqual({ width: 192, height: 192, mode: "cover" });
  });

  it("falls back to the largest size when the path carries no density", () => {
    expect(getAndroidRasterPlan({ role: "launcher_background" }, "res/mipmap/bg.png")).toEqual({ width: 432, height: 432, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "launcher_icon" }, "res/mipmap/ic.png")).toEqual({ width: 192, height: 192, mode: "cover" });
  });

  it("keeps the foreground layer transparent only when asked", () => {
    expect(getAndroidRasterPlan({ role: "launcher_foreground" }, "res/mipmap-xhdpi/fg.png", true))
      .toEqual({ width: 216, height: 216, mode: "transparent" });
    expect(getAndroidRasterPlan({ role: "launcher_foreground" }, "res/mipmap-xhdpi/fg.png"))
      .toEqual({ width: 216, height: 216, mode: "cover" });
  });

  it("uses a fixed size for the theme icon regardless of density", () => {
    expect(getAndroidRasterPlan({ role: "theme_icon" }, "res/drawable-mdpi/icon.png")).toEqual({ width: 144, height: 144, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "theme_icon" }, "res/drawable-xxxhdpi/icon.png")).toEqual({ width: 144, height: 144, mode: "cover" });
  });

  it("switches splash dimensions on the xhdpi bucket and follows orientation", () => {
    expect(getAndroidRasterPlan({ role: "splash" }, "res/drawable-xhdpi/splash.png")).toEqual({ width: 720, height: 1280, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "splash" }, "res/drawable-xxhdpi/splash.png")).toEqual({ width: 1440, height: 2560, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "splash_landscape" }, "res/drawable-land-xhdpi/splash.png")).toEqual({ width: 1280, height: 720, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "splash_landscape" }, "res/drawable-land-xxhdpi/splash.png")).toEqual({ width: 2560, height: 1440, mode: "cover" });
  });

  it("returns no plan for a role that ships its source unchanged", () => {
    expect(getAndroidRasterPlan({ role: "chat_background" }, "res/drawable-xxhdpi/bg.png")).toBeUndefined();
  });

  it("marks only the launcher-derived roles", () => {
    expect(isAndroidDerivedLauncherRole("launcher_icon")).toBe(true);
    expect(isAndroidDerivedLauncherRole("theme_icon")).toBe(true);
    expect(isAndroidDerivedLauncherRole("launcher_background")).toBe(false);
    expect(isAndroidDerivedLauncherRole("chat_background")).toBe(false);
  });
});
