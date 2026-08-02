import {
  getInheritedSourceSlot,
  getResolvedColor,
  getSelectedCandidate,
  getSelectedUpload,
  getSlotCandidates,
  getSharedSlotUploadEntries,
  getInheritedColorSourceSlot,
  disabledImageCandidateId,
  type BubbleEditState,
  type SlotCandidateSelections,
  type SlotColors,
  type SlotUploads,
} from "@/lib/theme/project/state";
import { getDerivedColorRule } from "@/lib/theme/project/colorInheritance";
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
  /**
   * 이 업로드가 실제로 들어 있는 bucket의 슬롯 id.
   *
   * 말풍선 네 슬롯은 업로드를 공유하므로 후보에 보이는 항목이 다른 슬롯 소유일 수 있다.
   * 삭제·미리보기 URL 해석은 보고 있는 슬롯이 아니라 이 값을 기준으로 해야 한다.
   */
  ownerSlotId?: string;
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
  getInheritedColorSourceSlot,
  getSharedBubbleUploadPeers,
  getSharedSlotUploadEntries,
  isSlotReady,
  planUploadRemoval,
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

/**
 * 사용자가 지울 수 있는 후보인가.
 *
 * `upload`은 이번 편집에서 올린 것, `template`은 저장된 시스템 템플릿을 열 때 원격 ref에서
 * hydrate되어 돌아온 것이다. 둘 다 이 프로젝트가 소유한 에셋이므로 지울 수 있어야 한다.
 * `admin`은 공용 라이브러리라 슬롯에서 빼는 것과 삭제가 다른 의미이므로 제외한다.
 * `inherited` 후보는 원본 슬롯의 선택을 읽기 전용으로 보여 주는 것이므로 파생 슬롯에서
 * 삭제할 수 없다. 삭제 버튼을 노출하면 파생 슬롯에는 owner entry가 없어 아무 동작도 하지 않는다.
 *
 * 실제로 지울 수 있는지는 공유 풀 역참조까지 봐야 하므로 `planUploadRemoval`이 최종 판정한다.
 * 이 함수는 "삭제 버튼을 보여줄 종류인가"만 답한다. 데스크톱·모바일 두 패널이 같은 기준을
 * 쓰도록 여기 한 곳에 둔다.
 */
export function isRemovableUploadCandidate(candidate: Pick<SlotCandidate, "source" | "inherited">) {
  return !candidate.inherited && (candidate.source === "upload" || candidate.source === "template");
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
  // 말풍선이면 같은 플랫폼 peer의 업로드까지 후보에 들어온다. owner를 함께 들고 다닌다.
  const uploadEntries = getSharedSlotUploadEntries(sourceSlot, uploads, allSlots);
  const selectedUpload = getSelectedUpload(sourceSlot, uploads, selections, allSlots);
  const candidates = getSlotCandidates(slot, templateId, template);
  const adminAssetIds = new Set(adminAssets.map((asset) => asset.id));

  const baseItems = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.label,
    status: slot.kind === "color" ? (candidate.colorValue ?? getResolvedColor(slot, colors, selections, templateId, template, allSlots) ?? "값 없음").toUpperCase() : candidate.note ?? slot.note,
    active: selected?.id === candidate.id,
    selected: selected?.id === candidate.id && !selectedUpload,
    source: candidate.isDefault || candidate.id === disabledImageCandidateId ? ("default" as const) : ("creator" as const),
    previewUrl: candidate.previewUrl ?? candidate.assetUrl,
    colorValue: candidate.colorValue,
  }));

  const uploadItems = uploadEntries
    .filter(({ entry }) => (entry.source ?? "user") === "user" && !adminAssetIds.has(entry.id))
    .slice()
    .reverse()
    .map(({ ownerSlotId, entry }) => ({
      id: entry.id,
      title: "업로드 이미지",
      status: entry.file.name,
      active: selectedUpload?.id === entry.id,
      selected: selectedUpload?.id === entry.id,
      source: "upload" as const,
      previewUrl: uploadPreviewUrls[entry.id],
      ownerSlotId,
    }));
  const templateItems = uploadEntries
    .filter(({ entry }) => entry.source === "template")
    .slice()
    .reverse()
    .map(({ ownerSlotId, entry }) => ({
      id: entry.id,
      title: "템플릿 에셋",
      status: entry.file.name,
      active: selectedUpload?.id === entry.id,
      selected: selectedUpload?.id === entry.id,
      source: "template" as const,
      previewUrl: uploadPreviewUrls[entry.id],
      ownerSlotId,
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

export type DerivedColorLink = {
  /** 기준 슬롯 라벨. 안내 문구에 그대로 넣는다. */
  baseLabel: string;
  /** 지금 기준 색을 따라가는 중인지. `getInheritedColorSourceSlot`과 같은 기준이다. */
  linked: boolean;
  /** 연동했을 때 적용될 색. 카드의 추천 색상 스와치에 쓴다. */
  color?: string;
  /** 무엇을 기준으로 계산하는지. 카드 본문과 툴팁에 공용으로 쓴다. */
  description: string;
};

/**
 * 기준 슬롯 연동 상태.
 *
 * 눌림·선택 색은 기준 색을 따라가다가, 사용자가 피커를 한 번 만지는 순간 `colors[slot.id]`에
 * 값이 써져 연동이 끊긴다. 되돌릴 방법이 없으면 실수로 만진 사람이 원래 상태로 못 돌아온다.
 *
 * 처음에는 팔레트 후보 칩으로 노출했는데, 배경에서 파생되는 슬롯들이 쓰는 "역할별 자동 맞춤"
 * 카드와 생김새도 조작법도 달라 같은 개념으로 보이지 않았다. 이제 두 패널 모두 이 값을 받아
 * 자동 맞춤과 **같은 UI**로 그린다.
 */
export function getDerivedColorLink(
  slot: ThemeAssetSlot,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  templateId: ThemeTemplateId,
  template: ThemeTemplate,
  allSlots: ThemeAssetSlot[],
): DerivedColorLink | undefined {
  const rule = getDerivedColorRule(slot.role);
  if (!rule) return undefined;
  const baseSlot = allSlots.find((candidate) => candidate.role === rule.baseRole && candidate.platform === slot.platform);
  if (!baseSlot) return undefined;

  // 끊긴 상태에서도 "연동하면 이 색이 된다"를 보여 줘야 하므로, 직접 지정을 뺀 상태로 한 번 더
  // 해석한다. 빼는 키는 되돌리기 동작(`unlinkColor`)이 지우는 것과 정확히 같아야 한다.
  const withoutOverride = { ...colors, [slot.id]: undefined };
  const withoutSelection = { ...selections, [slot.id]: undefined };

  return {
    baseLabel: baseSlot.label,
    linked: Boolean(getInheritedColorSourceSlot(slot, colors, selections, templateId, template, allSlots)),
    color: getResolvedColor(slot, withoutOverride, withoutSelection, templateId, template, allSlots),
    // 대비 보정형은 기준 색을 "따라가는" 게 아니라 그 위에서 읽히도록 맞추는 것이라 문구가
    // 달라야 한다. 같은 문구를 쓰면 사용자가 배경색이 그대로 온다고 오해한다.
    description: rule.transform === "contrast-on-base"
      ? `${baseSlot.label} 위에서 읽히도록 대비를 맞춥니다.`
      : `${baseSlot.label}을 기준으로 계산합니다.`,
  };
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
  const currentColor = getResolvedColor(activeSlot, colors, selections, templateId, template, allSlots);
  const map = new Map<string, { color: string; count: number }>();

  /**
   * 이 슬롯이 그 위에서 읽혀야 하는 배경색은 후보에서 뺀다.
   *
   * 팔레트는 테마에서 쓰이는 색을 모아 보여 준다. 그래서 읽지 않음 숫자를 편집할 때 채팅방
   * 배경색이 스와치로 떴고, 그걸 고르면 배경과 완전히 같은 색이 되어 글자가 사라진다.
   * 실제로 그렇게 눌러 "배경을 바꿔도 색이 안 변한다"는 신고가 나왔다 — 직접 지정이라
   * 연동까지 함께 꺼진 상태였다. 고를 수 없게 하는 편이 경고보다 낫다.
   */
  const surfaceRule = getDerivedColorRule(activeSlot.role);
  const surfaceSlot = surfaceRule?.transform === "contrast-on-base"
    ? allSlots.find((slot) => slot.role === surfaceRule.baseRole && slot.platform === activeSlot.platform)
    : undefined;
  const surfaceColor = surfaceSlot ? getResolvedColor(surfaceSlot, colors, selections, templateId, template, allSlots) : undefined;
  const excluded = surfaceColor ? normalizeColor(surfaceColor) : undefined;

  for (const slot of allSlots) {
    if (slot.kind !== "color") continue;
    const color = getResolvedColor(slot, colors, selections, templateId, template, allSlots);
    if (!color) continue;
    if (excluded && normalizeColor(color) === excluded) continue;

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
