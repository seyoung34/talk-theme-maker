import type { ThemeAssetSlot } from "@/lib/theme/templates";

export type CandidateLayoutKind = "wallpaper" | "image" | "color";

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
