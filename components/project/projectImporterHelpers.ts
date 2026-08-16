import { getInitialSlotCandidateSelections, type getSelectedCandidate, type SlotUploads } from "@/components/project/projectModel";
import { normalizeThemeColor, themeColorToCss } from "@/lib/theme/color";
import type { ImageEditTarget } from "@/lib/theme/imageEdit";
import { getImageColorFallbackRole } from "@/lib/theme/project/state";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import type { ThemeAssetSlot, ThemeTemplate, ThemeTemplateId } from "@/lib/theme/templates";

/**
 * 이 슬롯이 색을 받는 이미지의 분석 실패를 고른다.
 *
 * recipe마다 seed 이미지가 다르다. 목록에서 빠진 레시피는 조용히 **메인 배경** 오류로 넘어가서,
 * 실패한 적 없는 이미지의 오류가 뜨거나 정작 실패한 채팅 이미지의 오류가 안 뜬다. 입력바가
 * 채팅방 배경을 따라가게 됐을 때 실제로 그렇게 빠졌다.
 *
 * 데스크톱·모바일 패널이 같은 식을 각자 갖고 있었다. 한쪽만 고치면 어긋나므로 함수로 둔다.
 */
export function getSlotPaletteError(
  slot: ThemeAssetSlot | undefined,
  errors: { main: string | null; chat: string | null; bubble: string | null; passcode: string | null },
) {
  switch (slot?.autoColorRecipe) {
    case "chat-background-average":
    case "chat-background-bottom":
      return errors.chat;
    case "bubble-me-text":
    case "bubble-you-text":
      return errors.bubble;
    case "passcode-background-average":
      // 잠금화면은 자체 이미지가 없으면 메인 배경을 따라가지만, 자체 이미지를 넣었는데 분석이
      // 실패한 경우가 있다. 그때 메인 오류를 보여 주면 멀쩡한 이미지를 의심하게 된다.
      return errors.passcode ?? errors.main;
    default:
      return errors.main;
  }
}

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

// 아래 세 helper는 데스크톱/모바일 편집 패널이 함께 쓴다. 사본을 두면 한쪽만 고쳐져도
// 드러나지 않으므로(ChatroomPreview의 말풍선 렌더링이 그렇게 갈라졌다) 여기서만 정의한다.

/** 이미지 편집 다이얼로그가 기준으로 삼을 크기. 후보 메타데이터에 실측 크기가 없으면 기준을 세우지 않는다. */
export function getImageEditTarget(candidate: ReturnType<typeof getSelectedCandidate>): ImageEditTarget | undefined {
  const width = candidate?.metadata?.width;
  const height = candidate?.metadata?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return undefined;
  return { width, height, label: "선택 후보 기준" };
}

/** 배경 이미지 슬롯과 그 이미지가 비었을 때 쓰이는 색상 슬롯의 짝. 어느 쪽 슬롯에서 시작해도 같은 짝을 돌려준다. */
export function getBackgroundSourcePair(slot: ThemeAssetSlot, slots: ThemeAssetSlot[]) {
  const imageSlot =
    slot.kind === "color"
      ? slots.find((candidate) => candidate.kind !== "color" && getImageColorFallbackRole(candidate.role) === slot.role)
      : getImageColorFallbackRole(slot.role)
        ? slot
        : undefined;
  if (!imageSlot) return null;
  const colorRole = getImageColorFallbackRole(imageSlot.role);
  const colorSlot = slots.find((candidate) => candidate.kind === "color" && candidate.role === colorRole);
  return colorSlot ? { imageSlot, colorSlot } : null;
}

/** 슬롯 상태 문구에 색상 코드가 들어 있으면 칩으로 보여줄 CSS 색상을 뽑는다. */
export function getStatusColorPreview(status: string) {
  const color = status.match(/#[0-9a-f]{8}|#[0-9a-f]{6}/i)?.[0];
  return color && normalizeThemeColor(color) ? themeColorToCss(color) : null;
}
