import { describe, expect, it } from "vitest";
import { getAuthoringSlots, getAuthoringSlotVisibility, getDerivedAssetSourceRole, getThemeIconSourceRole } from "@/lib/theme/project/authoringPolicy";
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
    expect(getAuthoringSlots(androidSlots, "android", "user").map((slot) => slot.role)).not.toContain("theme_icon");
    expect(getAuthoringSlots(iosSlots, "ios", "user").map((slot) => slot.role)).toContain("theme_icon");
  });

  it("일반 편집기에서는 파생 role을 숨기고 관리자는 고급 영역에서 본다", () => {
    expect(getAuthoringSlots(slots, "android", "user").map((slot) => slot.role)).toEqual(["launcher_background", "splash"]);
    expect(getAuthoringSlots(slots, "android", "admin").map((slot) => slot.role)).toEqual(["launcher_background", "launcher_icon", "splash"]);
    expect(getAuthoringSlotVisibility(slots[1], "user")).toBe("hidden");
    expect(getAuthoringSlotVisibility(slots[1], "admin")).toBe("advanced");
  });

  it("Android launcher 호환 role은 launcher_background에서 파생된다", () => {
    expect(getDerivedAssetSourceRole("launcher_round", "android")).toBe("launcher_background");
    expect(getDerivedAssetSourceRole("theme_icon", "ios")).toBeUndefined();
  });
});
