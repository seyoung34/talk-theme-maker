import { disabledImageCandidateId, getDefaultSelectedCandidate } from "@/lib/theme/project/state";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeResourceRole } from "@/lib/theme/types";
import type { ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";

export function convertSystemTemplateOverridesByRole({
  sourceOverrides,
  sourceSlots,
  targetSlots,
  templateId,
  template,
}: {
  sourceOverrides: ThemeEditOverrides;
  sourceSlots: ThemeAssetSlot[];
  targetSlots: ThemeAssetSlot[];
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
}): ThemeEditOverrides {
  const sourceById = new Map(sourceSlots.map((slot) => [slot.id, slot]));
  const targetByRole = new Map<ThemeResourceRole, ThemeAssetSlot>();
  for (const slot of targetSlots) {
    if (!targetByRole.has(slot.role)) targetByRole.set(slot.role, slot);
  }

  const colors: ThemeEditOverrides["colors"] = {};
  const uploads: ThemeEditOverrides["uploads"] = {};
  const candidateSelections: ThemeEditOverrides["candidateSelections"] = {};
  const geometry: ThemeEditOverrides["bubbleEdits"]["geometry"] = {};
  const markers: ThemeEditOverrides["bubbleEdits"]["markers"] = {};
  const insets: ThemeEditOverrides["bubbleEdits"]["insets"] = {};
  const stretch: ThemeEditOverrides["bubbleEdits"]["stretch"] = {};
  const flipX: NonNullable<ThemeEditOverrides["bubbleEdits"]["flipX"]> = {};

  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.colors)) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) colors[targetSlot.id] = value;
  }

  for (const [sourceSlotId, entries] of Object.entries(sourceOverrides.uploads)) {
    if (!entries?.length) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) uploads[targetSlot.id] = entries.map((entry) => ({ ...entry }));
  }

  for (const [sourceSlotId, selectedId] of Object.entries(sourceOverrides.candidateSelections)) {
    if (!selectedId) continue;
    const sourceSlot = sourceById.get(sourceSlotId);
    const targetSlot = sourceSlot ? targetByRole.get(sourceSlot.role) ?? targetByRole.get(getEquivalentRole(sourceSlot.role)) : undefined;
    if (!sourceSlot || !targetSlot) continue;

    if (selectedId === disabledImageCandidateId) {
      candidateSelections[targetSlot.id] = disabledImageCandidateId;
      continue;
    }

    const sourceUploads = sourceOverrides.uploads[sourceSlotId] ?? [];
    if (sourceUploads.some((entry) => entry.id === selectedId)) {
      candidateSelections[targetSlot.id] = selectedId;
      continue;
    }

    if (selectedId.startsWith(`${sourceSlot.id}:`)) {
      candidateSelections[targetSlot.id] = getDefaultSelectedCandidate(targetSlot, templateId, template)?.id;
      continue;
    }

    candidateSelections[targetSlot.id] = selectedId;
  }

  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.bubbleEdits.geometry ?? {})) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) geometry[targetSlot.id] = value;
  }

  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.bubbleEdits.markers)) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) markers[targetSlot.id] = value;
  }

  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.bubbleEdits.insets)) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) insets[targetSlot.id] = value;
  }

  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.bubbleEdits.stretch)) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) stretch[targetSlot.id] = value;
  }

  // flipX도 slot id를 키로 쓰므로 플랫폼별 slot id로 다시 매핑해야 한다.
  // 빠뜨리면 플랫폼을 바꿀 때 좌표는 따라오는데 반전만 조용히 사라진다.
  for (const [sourceSlotId, value] of Object.entries(sourceOverrides.bubbleEdits.flipX ?? {})) {
    if (!value) continue;
    const targetSlot = targetSlotForSourceId(sourceSlotId, sourceById, targetByRole);
    if (targetSlot) flipX[targetSlot.id] = value;
  }

  return {
    colors,
    uploads,
    candidateSelections,
    bubbleEdits: { geometry, markers, insets, stretch, flipX, designs: sourceOverrides.bubbleEdits.designs ?? {} },
  };
}

function targetSlotForSourceId(
  sourceSlotId: string,
  sourceById: Map<string, ThemeAssetSlot>,
  targetByRole: Map<ThemeResourceRole, ThemeAssetSlot>,
) {
  const sourceSlot = sourceById.get(sourceSlotId);
  if (!sourceSlot) return undefined;
  return targetByRole.get(sourceSlot.role) ?? targetByRole.get(getEquivalentRole(sourceSlot.role));
}

function getEquivalentRole(role: ThemeResourceRole): ThemeResourceRole {
  if (role === "tab_paragraph_color") return "main_body_color";
  if (role === "main_body_color") return "tab_paragraph_color";
  if (role === "tab_paragraph_pressed_color") return "main_paragraph_pressed_color";
  if (role === "main_paragraph_pressed_color") return "tab_paragraph_pressed_color";
  return role;
}
