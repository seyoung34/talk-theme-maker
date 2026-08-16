import { disabledImageCandidateId, getDefaultSelectedCandidate, getResolvedColor, type SlotCandidateSelections, type SlotColors } from "@/lib/theme/project/state";
import { normalizeThemeDraft, type PersistedThemeDraft, type ThemeDraft } from "@/lib/theme/project/draft";
import type { ThemePlatform } from "@/lib/theme/types";
import { autoMainPaletteCandidateId, legacyAutoMainSurfaceCandidateId } from "@/lib/theme/autoColor";
import { getDerivedColorRule } from "@/lib/theme/project/colorInheritance";
import { getThemeSlots, getThemeTemplate, type ThemeAssetSlot, type ThemeTemplate, type ThemeTemplateId } from "@/lib/theme/templates";

const androidLegacySlotIds: Record<string, string> = {
  "android-main-body-color": "android-tab-paragraph-color",
  "android-main-paragraph-pressed-color": "android-tab-paragraph-pressed-color",
};

const iosLegacySlotIds: Record<string, string> = {
  "ios-main-paragraph-color": "ios-tab-paragraph-color",
  "ios-main-paragraph-highlighted-color": "ios-tab-paragraph-highlighted-color",
};

export type LegacyOverrideContext = {
  templateId: ThemeTemplateId;
  template: ThemeTemplate;
  slots: ThemeAssetSlot[];
};

export function normalizeLegacyColorOverrides(
  platform: ThemePlatform,
  colors: SlotColors,
  selections: SlotCandidateSelections,
  context: LegacyOverrideContext,
) {
  const mapping = platform === "android" ? androidLegacySlotIds : iosLegacySlotIds;
  const remappedColors = remapKeys(colors, mapping);
  const candidateSelections = remapSelections(selections, mapping);
  // 자동 표시를 지우기 **전에** 판단해야 한다. 아래 루프가 예전 파생 슬롯의 자동 표시를
  // 제거하므로, 순서를 바꾸면 옛 값이 그대로 굳는다.
  const nextColors = restoreDerivedColorLinks(remappedColors, candidateSelections, context);
  for (const [slotId, selectedId] of Object.entries(candidateSelections)) {
    if ((slotId === "android-main-background" || slotId === "ios-main-background-image") && selectedId === `${slotId}:base`) {
      candidateSelections[slotId] = disabledImageCandidateId;
      continue;
    }
    const slot = context.slots.find((candidate) => candidate.id === slotId);
    const staleAutoSelection = selectedId === autoMainPaletteCandidateId && Boolean(slot && !slot.autoColorRecipe);
    if (selectedId === legacyAutoMainSurfaceCandidateId || staleAutoSelection) {
      delete candidateSelections[slotId];
    }
  }
  // `nextColors`를 넘긴다. 위에서 기계가 쓴 값으로 판정돼 지워진 슬롯은 여기서도 "손대지 않은 것"이다.
  restoreMissingAutoSelections(nextColors, candidateSelections, context);
  return {
    colors: nextColors,
    candidateSelections,
  };
}

/**
 * 자동 색상 슬롯의 연동 표시를 복원한다. 두 가지 저장본이 대상이다.
 *
 * **① 후보 선택이 없는 저장본.** 예전에는 자동 색상 슬롯을 후보 선택에 기록하지 않았다. 그대로
 * 읽으면 기본 후보로 보이지만 자동 색상 hook이 연동 대상으로 인식하지 못한다.
 *
 * **② 기본 후보 id가 적힌 저장본.** 슬롯에 레시피가 **나중에 붙은** 경우다. 저장 시점에는 자동
 * 대상이 아니어서 `getInitialSlotCandidateSelections`가 기본 후보 id를 적어 뒀고, 그 값이
 * 남아 있으면 새 레시피가 영영 켜지지 않는다. 입력바가 채팅방 배경을 따라가게 되면서 실제로
 * 이 상황이 생겼다 — 열어 보면 입력바만 옛 기본색에 머물고, 거기서 파생되는 전송·메뉴 색도
 * 함께 굳는다.
 *
 * **직접 고른 색은 건드리지 않는다.** 색을 직접 지정하면 `colors[slot.id]`에 값이 남는다
 * (`changeColor`가 그렇게 쓰고, 선택은 기본 후보로 되돌린다). 그래서 ②의 조건에 "저장된 색이
 * 없을 것"을 함께 건다. 팔레트 스와치를 고른 경우는 선택 id 자체가 기본 후보가 아니라 걸리지 않는다.
 */
function restoreMissingAutoSelections(colors: SlotColors, selections: SlotCandidateSelections, { templateId, template, slots }: LegacyOverrideContext) {
  for (const slot of slots) {
    if (!slot.autoColorRecipe) continue;
    const selected = selections[slot.id];
    if (selected === undefined) {
      selections[slot.id] = autoMainPaletteCandidateId;
      continue;
    }
    if (selected !== getDefaultSelectedCandidate(slot, templateId, template)?.id) continue;
    if (colors[slot.id]) continue;
    selections[slot.id] = autoMainPaletteCandidateId;
  }
}

/**
 * IndexedDB 자동 저장·내보내기 복구본을 현재 런타임 초안 계약으로 승격하면서
 * 저장 템플릿과 동일한 legacy 색상/선택값 마이그레이션을 적용한다.
 */
export function normalizeLegacyThemeDraft(
  platform: ThemePlatform,
  templateId: ThemeTemplateId,
  draft: PersistedThemeDraft,
): ThemeDraft {
  const normalizedDraft = normalizeThemeDraft(draft);
  const normalizedOverrides = normalizeLegacyColorOverrides(
    platform,
    normalizedDraft.colors,
    normalizedDraft.candidateSelections,
    {
      templateId,
      template: getThemeTemplate(templateId),
      slots: getThemeSlots(platform),
    },
  );
  return {
    ...normalizedDraft,
    colors: normalizedOverrides.colors,
    candidateSelections: normalizedOverrides.candidateSelections,
  };
}

/**
 * 옛 자동 맞춤이 써 놓은 눌림·선택 색을 지워 기준 슬롯 연동으로 되돌린다.
 *
 * 이 슬롯들은 예전에 각자 `autoColorRecipe`로 **배경**에서 값을 받아 `colors`에 써 넣었다.
 * 지금은 기준 슬롯을 따라가는 파생 규칙으로 바뀌었는데, 저장본에 남은 그 값이 "사용자가 직접
 * 고른 색"으로 취급돼 연동이 처음부터 꺼진 채 열린다. 사용자가 고를 수 있는 시작점이 시스템
 * 템플릿뿐이라, 그대로 두면 연동이 아무에게도 닿지 않는다.
 *
 * 기계가 쓴 값이라는 근거는 둘이다.
 *
 * - 레시피가 없어진 슬롯에 **자동 맞춤 선택 표시**가 남아 있다 — 이제 아무 일도 하지 않는 잔재다.
 * - 값이 **연동이 만들 값과 같다** — 표시가 지워졌더라도 계산 결과와 일치하면 스냅샷이다.
 *
 * 둘 다 아니면 작성자가 의도적으로 고른 색이므로 손대지 않는다. 사용자는 편집창의 연동 카드로
 * 언제든 직접 되돌릴 수 있다.
 *
 * 잠금화면 계열이 생기면서 기준 슬롯이 그 자체로 또 파생인 체인이 존재하지만, 이 루프는 여전히
 * 순서에 의존하지 않는다. 이유가 "체인이 없어서"에서 바뀌었다 — 어떤 슬롯을 지우는 조건이
 * `pinned === derived`라서, 지운 뒤 해석해도 **같은 문자열**이 나오기 때문이다. 즉 앞에서 무엇을
 * 지웠든 뒤에 오는 슬롯의 계산 결과가 달라지지 않는다.
 */
function restoreDerivedColorLinks(colors: SlotColors, selections: SlotCandidateSelections, { templateId, template, slots }: LegacyOverrideContext) {
  const next = { ...colors };
  for (const slot of slots) {
    if (!getDerivedColorRule(slot.role)) continue;
    const pinned = next[slot.id];
    if (!pinned) continue;

    const selected = selections[slot.id];
    const staleAuto = !slot.autoColorRecipe && (selected === autoMainPaletteCandidateId || selected === legacyAutoMainSurfaceCandidateId);
    // 자기 값을 뺀 상태로 해석하면 연동이 만들 값이 나온다.
    const derived = getResolvedColor(slot, { ...next, [slot.id]: undefined }, { ...selections, [slot.id]: undefined }, templateId, template, slots);
    if (staleAuto || pinned.toUpperCase() === derived?.toUpperCase()) delete next[slot.id];
  }
  return next;
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
