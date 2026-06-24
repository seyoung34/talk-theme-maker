import type { SlotCandidateSelections, SlotColors } from "@/lib/theme/project/state";
import type { ThemePlatform } from "@/lib/theme/types";
import { autoMainPaletteCandidateId, legacyAutoMainSurfaceCandidateId } from "@/lib/theme/autoColor";

const androidLegacySlotIds: Record<string, string> = {
  "android-main-body-color": "android-tab-paragraph-color",
  "android-main-paragraph-pressed-color": "android-tab-paragraph-pressed-color",
};

const iosLegacySlotIds: Record<string, string> = {
  "ios-main-paragraph-color": "ios-tab-paragraph-color",
  "ios-main-paragraph-highlighted-color": "ios-tab-paragraph-highlighted-color",
};

export function normalizeLegacyColorOverrides(platform: ThemePlatform, colors: SlotColors, selections: SlotCandidateSelections) {
  const mapping = platform === "android" ? androidLegacySlotIds : iosLegacySlotIds;
  const candidateSelections = remapSelections(selections, mapping);
  for (const [slotId, selectedId] of Object.entries(candidateSelections)) {
    if (selectedId === legacyAutoMainSurfaceCandidateId || (platform === "ios" && selectedId === autoMainPaletteCandidateId)) delete candidateSelections[slotId];
  }
  return {
    colors: remapKeys(colors, mapping),
    candidateSelections,
  };
}

function remapKeys<T>(source: Record<string, T | undefined>, mapping: Record<string, string>) {
  const next = { ...source };
  for (const [legacyId, nextId] of Object.entries(mapping)) {
    if (next[nextId] === undefined && next[legacyId] !== undefined) next[nextId] = next[legacyId];
    delete next[legacyId];
  }
  return next;
}

function remapSelections(source: SlotCandidateSelections, mapping: Record<string, string>) {
  const next = remapKeys(source, mapping);
  for (const [slotId, selectedId] of Object.entries(next)) {
    if (!selectedId) continue;
    for (const [legacyId, nextId] of Object.entries(mapping)) {
      if (selectedId.startsWith(`${legacyId}:`)) next[slotId] = `${nextId}:${selectedId.slice(legacyId.length + 1)}`;
    }
  }
  return next;
}
