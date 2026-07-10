import { getInitialSlotCandidateSelections, type SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";

export function getDefaultSlotCandidateId(slot: ThemeAssetSlot, templateId: ThemeTemplateId, template: ThemeTemplate) {
  return getInitialSlotCandidateSelections([slot], templateId, template)[slot.id];
}

export function getMissingRemoteUploadSlotIds(uploadRefs: RemoteSlotUploads, uploads: SlotUploads, slotIds?: string[]) {
  const targetSlotIds = slotIds?.length ? slotIds : Object.keys(uploadRefs);
  return targetSlotIds.filter((slotId) => {
    const refs = uploadRefs[slotId] ?? [];
    if (!refs.length) return false;
    const currentIds = new Set((uploads[slotId] ?? []).map((entry) => entry.id));
    return refs.some((entry) => !currentIds.has(entry.id));
  });
}

export function keepCurrentRemoteUploads(uploads: SlotUploads, uploadRefs: RemoteSlotUploads): SlotUploads {
  const next: SlotUploads = {};
  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) continue;
    const currentRefIds = new Set((uploadRefs[slotId] ?? []).map((entry) => entry.id));
    const currentEntries = entries.filter((entry) => currentRefIds.has(entry.id));
    if (currentEntries.length) next[slotId] = currentEntries;
  }
  return next;
}

export function mergeSlotUploads(current: SlotUploads, incoming: SlotUploads): SlotUploads {
  const next: SlotUploads = { ...current };
  for (const [slotId, entries] of Object.entries(incoming)) {
    if (!entries?.length) continue;
    const currentEntries = next[slotId] ?? [];
    const currentIds = new Set(currentEntries.map((entry) => entry.id));
    next[slotId] = [...currentEntries, ...entries.filter((entry) => !currentIds.has(entry.id))];
  }
  return next;
}
