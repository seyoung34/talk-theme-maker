import { describe, expect, it } from "vitest";
import { getAndroidRasterPlan, isAndroidDerivedLauncherRole, readAndroidDensity } from "@/lib/theme/android/assetCompiler";

describe("Android 파생 이미지 출력 규격", () => {
  it("adaptive launcher는 density별 108~432px 정사각형을 사용한다", () => {
    expect(getAndroidRasterPlan({ role: "launcher_background" }, "src/main/res/mipmap-mdpi/ic_launcher_background.png")).toEqual({ width: 108, height: 108, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "launcher_background" }, "src/main/res/mipmap-xxxhdpi/ic_launcher_background.png")).toEqual({ width: 432, height: 432, mode: "cover" });
  });

  it("legacy launcher와 테마 목록 아이콘의 목표 크기를 분리한다", () => {
    expect(getAndroidRasterPlan({ role: "launcher_icon" }, "src/main/res/mipmap-xxxhdpi/ic_launcher.png")).toEqual({ width: 192, height: 192, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "launcher_round" }, "src/main/res/mipmap-xhdpi/ic_launcher_round.png")).toEqual({ width: 96, height: 96, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "theme_icon" }, "src/main/theme/drawable-xxhdpi/icon.png")).toEqual({ width: 144, height: 144, mode: "cover" });
  });

  it("기본 foreground는 같은 크기의 투명 레이어로 만든다", () => {
    expect(getAndroidRasterPlan({ role: "launcher_foreground" }, "src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", true)).toEqual({ width: 324, height: 324, mode: "transparent" });
    expect(isAndroidDerivedLauncherRole("launcher_foreground")).toBe(true);
    expect(isAndroidDerivedLauncherRole("splash")).toBe(false);
  });

  it("portrait/landscape splash는 xhdpi와 고밀도 출력을 구분한다", () => {
    expect(getAndroidRasterPlan({ role: "splash" }, "src/main/theme/drawable-xhdpi/theme_splash_image.png")).toEqual({ width: 720, height: 1280, mode: "cover" });
    expect(getAndroidRasterPlan({ role: "splash_landscape" }, "src/main/theme/drawable-land-xxhdpi/theme_splash_image.png")).toEqual({ width: 2560, height: 1440, mode: "cover" });
  });

  it("density를 경로에서 안전하게 읽는다", () => {
    expect(readAndroidDensity("src/main/res/mipmap-hdpi/ic_launcher.png")).toBe("hdpi");
    expect(readAndroidDensity("src/main/theme/drawable-sw600dp/theme_splash_image.png")).toBeUndefined();
  });
});
