import type { ThemeAssetSlot } from "@/lib/theme/templates";

export type CandidateLayoutKind = "wallpaper" | "image" | "color";

export const mobileCandidatePageSize = 16;

const wallpaperRoles = new Set(["main_background", "chat_background", "passcode_background"]);

export function getCandidateLayoutKind(slot: ThemeAssetSlot): CandidateLayoutKind {
  if (slot.kind === "color") return "color";
  if (wallpaperRoles.has(slot.role)) return "wallpaper";

  const aspectRatio = slot.constraints?.aspectRatio;
  const recommendedSize = slot.constraints?.recommendedSize;
  const width = aspectRatio?.width ?? recommendedSize?.width;
  const height = aspectRatio?.height ?? recommendedSize?.height;

  if (width && height && width / height <= 0.75) return "wallpaper";
  return "image";
}

export function getCandidateCardWidthClass(layoutKind: CandidateLayoutKind) {
  if (layoutKind === "wallpaper") return "w-[88px] shrink-0";
  if (layoutKind === "color") return "w-[92px] shrink-0";
  return "w-[96px] shrink-0";
}

export function getMobileCandidatePageCount(itemCount: number) {
  return Math.max(1, Math.ceil(Math.max(0, itemCount) / mobileCandidatePageSize));
}

export function getMobileCandidatePageIndex(itemIndex: number) {
  if (itemIndex <= 0) return 0;
  return Math.floor(itemIndex / mobileCandidatePageSize);
}
