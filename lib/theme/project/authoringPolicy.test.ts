import { describe, expect, it } from "vitest";
import { getAdminCompatibilitySlots, getAuthoringSlots, getDerivedAssetSourceRole, getThemeIconSourceRole } from "@/lib/theme/project/authoringPolicy";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import { getThemeSlots } from "@/lib/theme/templates";

const slots = [
  { id: "source", platform: "android", role: "launcher_background", section: "common", group: "icon", kind: "image", label: "테마 아이콘", required: true, note: "" },
  { id: "derived", platform: "android", role: "launcher_icon", section: "common", group: "icon", kind: "image", label: "런처 아이콘", required: true, note: "", optionLevel: "advanced", editorVisibility: "hidden" },
  { id: "splash", platform: "android", role: "splash", section: "common", group: "launcher", kind: "image", label: "실행 화면", required: true, note: "" },
] as ThemeAssetSlot[];

describe("authoring policy", () => {
  it("플랫폼별 canonical role을 하나의 테마 아이콘 입력으로 추상화한다", () => {
    const androidSlots = getThemeSlots("android");
    const iosSlots = getThemeSlots("ios");
    const androidSource = androidSlots.find((slot) => slot.role === getThemeIconSourceRole("android"));
    const iosSource = iosSlots.find((slot) => slot.role === getThemeIconSourceRole("ios"));

    expect(androidSource).toMatchObject({ group: "icon", label: "테마 아이콘" });
    expect(iosSource).toMatchObject({ group: "icon", label: "테마 아이콘" });
    expect(getAuthoringSlots(androidSlots, "android").map((slot) => slot.role)).not.toContain("theme_icon");
    expect(getAuthoringSlots(iosSlots, "ios").map((slot) => slot.role)).toContain("theme_icon");
  });

  it("기본 편집 슬롯은 audience와 무관하고 호환 role은 별도 목록으로 분리한다", () => {
    expect(getAuthoringSlots(slots, "android").map((slot) => slot.role)).toEqual(["launcher_background", "splash"]);
    expect(getAdminCompatibilitySlots(slots, "android").map((slot) => slot.role)).toEqual(["launcher_icon"]);
  });

  it("실제 Android 테마 아이콘 기본 UX는 하나의 입력만 제공한다", () => {
    const androidSlots = getThemeSlots("android");
    expect(getAuthoringSlots(androidSlots, "android").filter((slot) => slot.group === "icon").map((slot) => slot.role)).toEqual(["launcher_background"]);
    expect(getAdminCompatibilitySlots(androidSlots, "android").filter((slot) => slot.group === "icon").map((slot) => slot.role)).toEqual([
      "theme_icon",
      "launcher_icon",
      "launcher_round",
      "launcher_foreground",
    ]);
  });

  it("Android launcher 호환 role은 launcher_background에서 파생된다", () => {
    expect(getDerivedAssetSourceRole("launcher_round", "android")).toBe("launcher_background");
    expect(getDerivedAssetSourceRole("theme_icon", "ios")).toBeUndefined();
  });
});
