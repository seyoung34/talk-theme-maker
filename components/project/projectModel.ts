import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeSlotCandidate, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { BubbleSlot, Insets, Markers, StretchPoint, ThemeResourceRole, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export type SlotUploadEntry = {
  id: string;
  file: File;
};

export type SlotUploads = Record<string, SlotUploadEntry[] | undefined>;
export type SlotColors = Record<string, string | undefined>;
export type SlotCandidateSelections = Record<string, string | undefined>;

export type BubbleEditState = {
  markers?: Markers;
  insets?: Insets;
  stretch?: StretchPoint;
};

export type SlotCandidate = {
  id: string;
  title: string;
  status: string;
  active: boolean;
  selected: boolean;
  source: "candidate" | "upload";
};

export const sectionOrder: ThemeSection[] = ["main", "tabs", "chatroom"];

export const sectionLabels: Record<ThemeSection, string> = {
  main: "메인화면",
  tabs: "하단 탭",
  chatroom: "채팅방",
};

export const groupLabels: Record<ThemeSlotGroup, string> = {
  background: "배경",
  header: "헤더",
  list: "목록",
  bar: "탭 바",
  icons: "아이콘",
  bubbles: "말풍선",
  input: "입력바",
};

export function getSectionGroups(section: ThemeSection, slots: ThemeAssetSlot[]) {
  return Array.from(new Set(slots.filter((slot) => slot.section === section).map((slot) => slot.group)));
}

export function getSlotFile(slot: ThemeAssetSlot | undefined, files: ThemeProjectFile[]) {
  if (!slot?.path) return undefined;
  return files.find((file) => file.path === slot.path);
}

export function getSlotUploadEntries(slot: ThemeAssetSlot | undefined, uploads: SlotUploads) {
  if (!slot) return [];
  return uploads[slot.id] ?? [];
}

export function bubbleSlotFromRole(role: ThemeResourceRole): BubbleSlot | null {
  if (role === "bubble_me_1" || role === "bubble_me_2") return "me";
  if (role === "bubble_you_1" || role === "bubble_you_2") return "you";
  return null;
}

export function getDefaultColor(slot: ThemeAssetSlot, templateId: ThemeTemplateId, template: ThemeTemplate) {
  if (slot.defaultColor?.[templateId]) return slot.defaultColor[templateId];

  switch (slot.role) {
    case "chat_background_color":
      return template.defaults.chatBackground;
    case "main_header_color":
      return template.defaults.mainHeader;
    case "main_title_color":
      return template.defaults.mainTitle;
    case "main_body_color":
      return template.defaults.mainBody;
    case "tab_background":
      return template.defaults.tabBackground;
    case "chat_input_background_color":
      return template.defaults.chatInputBackground;
    case "chat_send_button_color":
      return template.defaults.chatSendButton;
    default:
      return "#ffffff";
  }
}

export function getSlotCandidates(slot: ThemeAssetSlot | undefined, templateId: ThemeTemplateId, template: ThemeTemplate): ThemeSlotCandidate[] {
  if (!slot) return [];

  const configured = slot.candidates?.[templateId];
  if (configured?.length) return configured;

  if (slot.kind === "color") {
    return [
      {
        id: `${slot.id}:base`,
        label: "기본값",
        note: slot.note,
        colorValue: getDefaultColor(slot, templateId, template),
        isDefault: true,
      },
    ];
  }

  const assetUrl = slot.defaultAssetUrls?.[templateId];
  if (!assetUrl) return [];

  return [
    {
      id: `${slot.id}:base`,
      label: "기본값",
      note: slot.note,
      assetUrl,
      isDefault: true,
    },
  ];
}

export function getInitialSlotCandidateSelections(slots: ThemeAssetSlot[], templateId: ThemeTemplateId, template: ThemeTemplate): SlotCandidateSelections {
  return Object.fromEntries(
    slots.map((slot) => {
      const defaultCandidate = getDefaultSelectedCandidate(slot, templateId, template);
      return [slot.id, defaultCandidate?.id];
    }),
  );
}

export function getDefaultSelectedCandidate(slot: ThemeAssetSlot | undefined, templateId: ThemeTemplateId, template: ThemeTemplate) {
  const candidates = getSlotCandidates(slot, templateId, template);
  return candidates.find((candidate) => candidate.isDefault) ?? candidates[0];
}

export function getSelectedCandidate(
  slot: ThemeAssetSlot | undefined,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot) return undefined;
  const candidates = getSlotCandidates(slot, templateId, template);
  const selectedId = selections[slot.id];
  return candidates.find((candidate) => candidate.id === selectedId) ?? getDefaultSelectedCandidate(slot, templateId, template);
}

export function getResolvedAssetUrl(
  slot: ThemeAssetSlot | undefined,
  uploads: SlotUploads,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot || slot.kind === "color") return undefined;
  if (getSelectedUpload(slot, uploads, selections)) return undefined;
  return getSelectedCandidate(slot, selections, templateId, template)?.assetUrl;
}

export function getSelectedUpload(slot: ThemeAssetSlot | undefined, uploads: SlotUploads, selections: SlotCandidateSelections) {
  if (!slot) return undefined;
  const uploadEntries = uploads[slot.id] ?? [];
  const selectedId = selections[slot.id];
  return uploadEntries.find((entry) => entry.id === selectedId);
}

export function getResolvedColor(
  slot: ThemeAssetSlot | undefined,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  if (!slot || slot.kind !== "color") return undefined;
  return colors[slot.id] ?? getSelectedCandidate(slot, selections, templateId, template)?.colorValue ?? getDefaultColor(slot, templateId, template);
}

export function getCompletion(
  slots: ThemeAssetSlot[],
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
) {
  return {
    total: slots.length,
    ready: slots.filter((slot) => isSlotReady(slot, uploads, colors, selections, templateId, template)).length,
  };
}

export function isSlotReady(slot: ThemeAssetSlot, uploads: SlotUploads, colors: SlotColors, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate) {
  if (slot.kind === "color") return Boolean(getResolvedColor(slot, colors, selections, templateId, template));
  return Boolean(getSelectedUpload(slot, uploads, selections) || getResolvedAssetUrl(slot, uploads, selections, templateId, template));
}

export function slotStatusLabel(slot: ThemeAssetSlot, uploads: SlotUploads, colors: SlotColors, selections: SlotCandidateSelections, templateId: ThemeTemplateId, template: ThemeTemplate) {
  if (slot.kind === "color") {
    const color = getResolvedColor(slot, colors, selections, templateId, template);
    return color ? color.toUpperCase() : "값 필요";
  }
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  if (selectedUpload) return selectedUpload.file.name;
  const selected = getSelectedCandidate(slot, selections, templateId, template);
  if (selected?.label) return selected.label;
  if (slot.required) return "필수 파일 필요";
  return "선택 파일";
}

export function buildSlotCandidates(
  slot: ThemeAssetSlot | undefined,
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
): SlotCandidate[] {
  if (!slot) return [];
  const selected = getSelectedCandidate(slot, selections, templateId, template);
  const uploadEntries = getSlotUploadEntries(slot, uploads);
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  const candidates = getSlotCandidates(slot, templateId, template);

  const baseItems = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.label,
    status: slot.kind === "color" ? (candidate.colorValue ?? getResolvedColor(slot, colors, selections, templateId, template) ?? "값 없음").toUpperCase() : candidate.note ?? slot.note,
    active: selected?.id === candidate.id,
    selected: selected?.id === candidate.id && !selectedUpload,
    source: "candidate" as const,
  }));

  const uploadItems = uploadEntries
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      title: "업로드 이미지",
      status: entry.file.name,
      active: selectedUpload?.id === entry.id,
      selected: selectedUpload?.id === entry.id,
      source: "upload" as const,
    }));

  return [...uploadItems, ...baseItems];
}
