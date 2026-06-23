import type { SlotCandidateSelections, SlotColors } from "@/lib/theme/project/state";
import type { ThemePlatform } from "@/lib/theme/types";

const androidLegacySlotIds: Record<string, string> = {
  "android-main-body-color": "android-tab-paragraph-color",
  "android-main-paragraph-pressed-color": "android-tab-paragraph-pressed-color",
};

export function normalizeLegacyColorOverrides(platform: ThemePlatform, colors: SlotColors, selections: SlotCandidateSelections) {
  if (platform !== "android") return { colors, candidateSelections: selections };
  return {
    colors: remapKeys(colors, androidLegacySlotIds),
    candidateSelections: remapSelections(selections, androidLegacySlotIds),
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
