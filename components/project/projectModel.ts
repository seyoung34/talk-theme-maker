import {
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotCandidates,
  getSlotUploadEntries,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/lib/theme/project/state";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export type SlotCandidate = {
  id: string;
  title: string;
  status: string;
  active: boolean;
  selected: boolean;
  source: "default" | "creator" | "upload";
  previewUrl?: string;
  colorValue?: string;
};

export const sectionOrder: ThemeSection[] = ["main", "tabs", "chatroom", "common"];

export const sectionLabels: Record<ThemeSection, string> = {
  main: "메인 화면",
  tabs: "하단 탭",
  chatroom: "채팅방",
  common: "공통 리소스",
};

export const groupLabels: Record<ThemeSlotGroup, string> = {
  background: "배경",
  header: "헤더",
  list: "목록",
  bar: "탭 바",
  icons: "아이콘",
  bubbles: "말풍선",
  input: "입력 바",
  icon: "대표 아이콘",
  profiles: "프로필",
};

export {
  bubbleSlotFromRole,
  getCompletion,
  getDefaultColor,
  getInitialSlotCandidateSelections,
  getResolvedAssetUrl,
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotUploadEntries,
  isSlotReady,
  slotStatusLabel,
} from "@/lib/theme/project/state";
export type { BubbleEditState, SlotCandidateSelections, SlotColors, SlotUploadEntry, SlotUploads } from "@/lib/theme/project/state";

export function getSectionGroups(section: ThemeSection, slots: ThemeAssetSlot[]) {
  return Array.from(new Set(slots.filter((slot) => slot.section === section).map((slot) => slot.group)));
}

export function getSlotFile(slot: ThemeAssetSlot | undefined, files: ThemeProjectFile[]) {
  if (!slot?.path) return undefined;
  return files.find((file) => file.path === slot.path);
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
    source: candidate.isDefault ? ("default" as const) : ("creator" as const),
    previewUrl: candidate.previewUrl ?? candidate.assetUrl,
    colorValue: candidate.colorValue,
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
