import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemeExportMapping, ThemePlatform } from "@/lib/theme/types";

export function getSlotExportMapping(slot: ThemeAssetSlot): ThemeExportMapping | undefined {
  const configured = slot.export?.[slot.platform];
  if (configured) return configured;

  if (slot.kind === "color" && slot.colorKey) {
    return {
      type: "css-color",
      target: slot.colorKey,
      transform: "write-css",
    };
  }

  if (!slot.path) return undefined;

  const scaleTargets = slot.platform === "ios" ? createIosScaleTargets(slot.fileName) : undefined;
  return {
    type: slot.platform === "ios" ? "css-image" : "file",
    target: slot.path,
    scaleTargets,
    transform: getDefaultTransform(slot.platform, slot.kind),
  };
}

function getDefaultTransform(platform: ThemePlatform, kind: ThemeAssetSlot["kind"]): ThemeExportMapping["transform"] {
  if (kind === "ninepatch") return "render-9patch";
  if (platform === "ios") return "resize";
  return "copy";
}

function createIosScaleTargets(fileName?: string) {
  if (!fileName?.includes("@3x")) return undefined;
  return [fileName.replace("@3x", "@2x"), fileName];
}
