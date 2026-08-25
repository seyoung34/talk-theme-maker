import { getDerivedAssetSourceRole } from "@/lib/theme/project/authoringPolicy";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import {
  getDefaultSelectedCandidate,
  getInheritedSourceSlot,
  getResolvedAssetUrl,
  getSelectedCandidate,
  getSelectedUpload,
  isImageSlotDisabled,
  type SlotCandidateSelections,
  type SlotUploads,
} from "@/lib/theme/project/state";

/**
 * Android launcher compatibility roles are not independent user inputs.
 * They become derived only after the user supplies an explicit launcher source.
 * Keeping this rule here lets preview analysis and platform export share it.
 */
export function shouldUseDerivedAssetSource(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
) {
  if (slot.kind === "color" || getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots)) return false;

  const sourceRole = getDerivedAssetSourceRole(slot.role, slot.platform);
  if (!sourceRole || hasExplicitImageSource(slot, uploads, selections, templateId, template, allSlots)) return false;

  const sourceSlot = allSlots.find((candidate) => candidate.role === sourceRole && candidate.platform === slot.platform);
  return Boolean(sourceSlot && hasExplicitImageSource(sourceSlot, uploads, selections, templateId, template, allSlots));
}

/**
 * Resolve the image source that both the preview analysis and export should consume.
 * The target slot's path/name remain the caller's responsibility; only its source is shared.
 */
export function resolveProjectImageSource(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
) {
  if (isImageSlotDisabled(slot, selections)) {
    return {
      sourceSlot: slot,
      selectedUpload: undefined,
      upload: undefined,
      sourceUrl: undefined,
      previewUrl: undefined,
    };
  }

  const inheritedSource = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots);
  const derivedSource = !inheritedSource && shouldUseDerivedAssetSource(slot, uploads, selections, templateId, template, allSlots)
    ? allSlots.find((candidate) => candidate.role === getDerivedAssetSourceRole(slot.role, slot.platform) && candidate.platform === slot.platform)
    : undefined;
  const sourceSlot = inheritedSource ?? derivedSource ?? slot;
  const selectedUpload = getSelectedUpload(sourceSlot, uploads, selections, allSlots);
  const upload = selectedUpload?.file;
  const sourceUrl = getResolvedAssetUrl(sourceSlot, uploads, selections, templateId, template, allSlots);
  const previewUrl = upload ? undefined : selectedUpload?.catalog?.previewUrl ?? getSelectedCandidate(sourceSlot, selections, templateId, template)?.previewUrl;

  return { sourceSlot, selectedUpload, upload, sourceUrl, previewUrl };
}

function hasExplicitImageSource(
  slot: ThemeAssetSlot,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
) {
  if (getSelectedUpload(slot, uploads, selections, allSlots)) return true;
  const selectedId = selections[slot.id];
  const defaultCandidate = getDefaultSelectedCandidate(slot, templateId, template);
  return Boolean(selectedId && selectedId !== defaultCandidate?.id);
}
