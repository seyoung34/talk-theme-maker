import {
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotCandidates,
  getSlotUploadEntries,
  disabledImageCandidateId,
  isColorSlotDisabledByImage,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/lib/theme/project/state";
import { describeAdminAssetAnalysis, getAdminAssetKindLabel, isAdminAssetRecommendedForSlot, type AdminAssetCandidate } from "@/lib/theme/adminAssets";
import type { ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

export type SlotCandidate = {
  id: string;
  title: string;
  status: string;
  active: boolean;
  selected: boolean;
  source: "default" | "creator" | "upload" | "palette" | "admin";
  previewUrl?: string;
  colorValue?: string;
  adminAsset?: AdminAssetCandidate;
};

export const sectionOrder: ThemeSection[] = ["main", "tabs", "chatroom", "passcode", "common"];

export const sectionLabels: Record<ThemeSection, string> = {
  main: "메인 화면",
  tabs: "하단 탭",
  chatroom: "채팅방",
  passcode: "잠금화면",
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
  launcher: "런처 아이콘",
  text: "텍스트",
  keypad: "키패드",
  pattern: "패턴",
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
  allSlots: ThemeAssetSlot[] = [],
  adminAssets: AdminAssetCandidate[] = [],
): SlotCandidate[] {
  if (!slot) return [];

  const selected = getSelectedCandidate(slot, selections, templateId, template);
  const uploadEntries = getSlotUploadEntries(slot, uploads);
  const selectedUpload = getSelectedUpload(slot, uploads, selections);
  const candidates = getSlotCandidates(slot, templateId, template);
  const colorDisabledByImage = isColorSlotDisabledByImage(slot, allSlots, uploads, selections, templateId, template);

  const baseItems = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.label,
    status: colorDisabledByImage ? "색상 사용 안함" : slot.kind === "color" ? (candidate.colorValue ?? getResolvedColor(slot, colors, selections, templateId, template) ?? "값 없음").toUpperCase() : candidate.note ?? slot.note,
    active: selected?.id === candidate.id,
    selected: selected?.id === candidate.id && !selectedUpload,
    source: candidate.isDefault || candidate.id === disabledImageCandidateId ? ("default" as const) : ("creator" as const),
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

  const paletteItems = slot.kind === "color" ? buildPaletteCandidates(slot, allSlots, uploads, colors, selections, templateId, template) : [];
  const adminItems = slot.kind !== "color" ? buildAdminCandidates(slot, selectedUpload?.id, adminAssets) : [];

  return [...uploadItems, ...adminItems, ...paletteItems, ...baseItems];
}

function buildAdminCandidates(slot: ThemeAssetSlot, selectedUploadId: string | undefined, adminAssets: Array<AdminAssetCandidate & { previewUrl?: string }>): SlotCandidate[] {
  return adminAssets
    .filter((asset) => isAdminAssetRecommendedForSlot(slot, asset))
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      status: asset.slotRole === slot.role ? (asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : asset.fileName) : `${asset.assetKind ? getAdminAssetKindLabel(asset.assetKind) : "유사 에셋"} · ${describeAdminAssetAnalysis(asset.analysis)}`,
      active: selectedUploadId === asset.id,
      selected: selectedUploadId === asset.id,
      source: "admin" as const,
      previewUrl: asset.previewUrl,
      adminAsset: asset,
    }));
}

function buildPaletteCandidates(
  activeSlot: ThemeAssetSlot,
  allSlots: ThemeAssetSlot[],
  uploads: SlotUploads,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
): SlotCandidate[] {
  const currentColor = getResolvedColor(activeSlot, colors, selections, templateId, template);
  const map = new Map<string, { color: string; count: number }>();

  for (const slot of allSlots) {
    if (slot.kind !== "color") continue;
    if (isColorSlotDisabledByImage(slot, allSlots, uploads, selections, templateId, template)) continue;
    const color = getResolvedColor(slot, colors, selections, templateId, template);
    if (!color) continue;

    const key = normalizeColor(color);
    const item = map.get(key);
    if (item) {
      item.count += 1;
    } else {
      map.set(key, { color, count: 1 });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color))
    .map((item) => ({
      id: `${activeSlot.id}:palette:${item.color}`,
      title: item.color.toUpperCase(),
      status: `${item.count}개 슬롯에서 사용 중`,
      active: normalizeColor(currentColor) === normalizeColor(item.color),
      selected: false,
      source: "palette" as const,
      colorValue: item.color,
    }));
}

function normalizeColor(value?: string) {
  return value?.trim().toUpperCase() ?? "";
}
