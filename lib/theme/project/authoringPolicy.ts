import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export type EditorAudience = "user" | "admin";

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
    return "launcher_background" as const;
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
