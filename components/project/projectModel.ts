import {
  getInheritedSourceSlot,
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotCandidates,
  getSlotUploadEntries,
  disabledImageCandidateId,
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
  source: "default" | "creator" | "upload" | "template" | "palette" | "admin";
  previewUrl?: string;
  colorValue?: string;
  adminAsset?: AdminAssetCandidate;
  // 파생 슬롯(탭 선택 아이콘 등)이 기본 슬롯의 선택을 상속해 표시 중인 항목. 읽기 전용(연동 배지).
  inherited?: boolean;
};

export const sectionOrder: ThemeSection[] = ["main", "tabs", "chatroom", "more", "passcode", "common"];

export const sectionLabels: Record<ThemeSection, string> = {
  main: "친구/메인",
  tabs: "채팅/하단 탭",
  more: "더보기",
  chatroom: "채팅방",
  passcode: "잠금화면",
  common: "공통 리소스",
};

export const groupLabels: Record<ThemeSlotGroup, string> = {
  background: "배경",
  header: "헤더",
  list: "목록",
  bar: "탭 바",
  icons: "탭 아이콘",
  elements: "부가 요소",
  bubbles: "말풍선",
  input: "입력 바",
  icon: "대표 아이콘",
  profiles: "프로필",
  launcher: "런처 아이콘",
  text: "상단",
  keypad: "하단",
  pattern: "패턴",
};

// 편집기의 그룹 탭 순서를 정하는 유일한 기준. 슬롯 매니페스트의 나열 순서는 쓰지 않는다.
// 공통 리소스에서는 프로필이 대표 아이콘보다 앞이다. 프로필은 채팅·친구 화면에 바로 보여
// 먼저 손대게 되고, 대표 아이콘은 테마 목록에서만 보여 나중에 챙기는 리소스다.
const groupOrder: ThemeSlotGroup[] = ["background", "header", "list", "bar", "icons", "elements", "bubbles", "input", "text", "keypad", "pattern", "profiles", "icon", "launcher"];

export {
  bubbleSlotFromRole,
  disabledImageCandidateId,
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
  const groups = new Set(slots.filter((slot) => isSlotVisibleInSection(slot, section)).map((slot) => slot.group));
  return groupOrder.filter((group) => groups.has(group));
}

export function isSlotVisibleInSection(slot: ThemeAssetSlot, section: ThemeSection) {
  return slot.section === section || Boolean(slot.visibleInSections?.includes(section));
}

export function isSlotVisibleInGroup(slot: ThemeAssetSlot, group: ThemeSlotGroup) {
  return slot.group === group || Boolean(slot.visibleInGroups?.includes(group));
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
  uploadPreviewUrls: Record<string, string> = {},
): SlotCandidate[] {
  if (!slot) return [];

  // 파생 슬롯(탭 선택 아이콘 등)이 직접 선택 없이 연동 중이면 기본 슬롯의 선택 상태를 상속해 표시한다.
  const inheritedSource = getInheritedSourceSlot(slot, uploads, selections, templateId, template, allSlots);
  const sourceSlot = inheritedSource ?? slot;
  const selected = getSelectedCandidate(sourceSlot, selections, templateId, template);
  const uploadEntries = getSlotUploadEntries(sourceSlot, uploads);
  const selectedUpload = getSelectedUpload(sourceSlot, uploads, selections);
  const candidates = getSlotCandidates(slot, templateId, template);
  const adminAssetIds = new Set(adminAssets.map((asset) => asset.id));

  const baseItems = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.label,
    status: slot.kind === "color" ? (candidate.colorValue ?? getResolvedColor(slot, colors, selections, templateId, template) ?? "값 없음").toUpperCase() : candidate.note ?? slot.note,
    active: selected?.id === candidate.id,
    selected: selected?.id === candidate.id && !selectedUpload,
    source: candidate.isDefault || candidate.id === disabledImageCandidateId ? ("default" as const) : ("creator" as const),
    previewUrl: candidate.previewUrl ?? candidate.assetUrl,
    colorValue: candidate.colorValue,
  }));

  const uploadItems = uploadEntries
    .filter((entry) => (entry.source ?? "user") === "user" && !adminAssetIds.has(entry.id))
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      title: "업로드 이미지",
      status: entry.file.name,
      active: selectedUpload?.id === entry.id,
      selected: selectedUpload?.id === entry.id,
      source: "upload" as const,
      previewUrl: uploadPreviewUrls[entry.id],
    }));
  const templateItems = uploadEntries
    .filter((entry) => entry.source === "template")
    .slice()
    .reverse()
    .map((entry) => ({
      id: entry.id,
      title: "템플릿 에셋",
      status: entry.file.name,
      active: selectedUpload?.id === entry.id,
      selected: selectedUpload?.id === entry.id,
      source: "template" as const,
      previewUrl: uploadPreviewUrls[entry.id],
    }));

  const paletteItems = slot.kind === "color" ? buildPaletteCandidates(slot, allSlots, uploads, colors, selections, templateId, template) : [];
  const adminItems = slot.kind !== "color" ? buildAdminCandidates(slot, selectedUpload?.id, adminAssets) : [];

  const allItems = [...templateItems, ...uploadItems, ...adminItems, ...paletteItems, ...baseItems];
  // 연동(기본 슬롯 상속) 중이면 선택 표시된 항목은 읽기 전용 상속 항목으로 표시한다.
  if (inheritedSource) return allItems.map((item) => (item.selected ? { ...item, inherited: true } : item));
  return allItems;
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
