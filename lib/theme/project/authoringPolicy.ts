import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export type EditorAudience = "user" | "admin";

/**
 * 사용자에게는 플랫폼과 무관하게 하나의 `테마 아이콘`으로 보이지만, 저장·export 계약은
 * 플랫폼별 canonical role을 유지한다. Android는 launcher family의 원본을 배경 role에 두고,
 * iOS는 테마 목록 아이콘 role 자체를 원본으로 사용한다.
 */
const themeIconSourceRoleByPlatform = {
  android: "launcher_background",
  ios: "theme_icon",
} as const;

export function getThemeIconSourceRole(platform: ThemePlatform) {
  return themeIconSourceRoleByPlatform[platform];
}

/**
 * 저장·preview·export가 사용하는 canonical slot 전체와, 편집기에 보여 줄 source slot을 분리한다.
 * `editorVisibility: hidden`은 일반 사용자에게만 숨기며 관리자에게는 고급 호환 영역으로 남긴다.
 */
export function getAuthoringSlots(
  slots: ThemeAssetSlot[],
  platform: ThemePlatform,
  audience: EditorAudience,
) {
  return slots.filter((slot) => (
    slot.platform === platform
    && (audience === "admin" || slot.editorVisibility !== "hidden")
  ));
}

export function getAuthoringSlotVisibility(slot: Pick<ThemeAssetSlot, "editorVisibility">, audience: EditorAudience) {
  if (slot.editorVisibility === "hidden") return audience === "admin" ? "advanced" : "hidden";
  return slot.editorVisibility ?? "source";
}

export function getCommonResourceGroups(
  slots: ThemeAssetSlot[],
  platform: ThemePlatform,
  audience: EditorAudience,
  section: ThemeSection = "common",
) {
  const groups = new Set(
    getAuthoringSlots(slots, platform, audience)
      .filter((slot) => slot.section === section || slot.visibleInSections?.includes(section))
      .map((slot) => slot.group),
  );
  return (["profiles", "icon", "launcher"] as ThemeSlotGroup[]).filter((group) => groups.has(group));
}

export function getDerivedAssetSourceRole(targetRole: ThemeAssetSlot["role"], platform: ThemePlatform) {
  if (platform === "android" && ["theme_icon", "launcher_icon", "launcher_round", "launcher_foreground"].includes(targetRole)) {
    return getThemeIconSourceRole(platform);
  }
  return undefined;
}

// 호출부가 role visibility 구현을 직접 알지 않도록 얇은 facade를 둔다.
export function getAuthoringPolicy(platform: ThemePlatform, audience: EditorAudience) {
  return {
    platform,
    audience,
    getSlots: (slots: ThemeAssetSlot[]) => getAuthoringSlots(slots, platform, audience),
  };
}
