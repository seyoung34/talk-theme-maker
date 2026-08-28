import type { AdminAssetCandidate, AdminAssetKind, AdminAssetPlatform, AdminAssetTarget, AdminAssetTargetInput } from "@/lib/theme/adminAssetDomain";
import { getAdminAssetKindLabel, inferAdminAssetKind } from "@/lib/theme/adminAssetDomain";
import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type AdminAssetWorkspaceSlot = {
  readonly key: string;
  readonly role: ThemeResourceRole;
  readonly kind: AdminAssetKind;
  readonly label: string;
  readonly variants: Partial<Record<ThemePlatform, ThemeAssetSlot>>;
};

export type AdminAssetMatchRank = 0 | 1 | 2;

/**
 * 판정에 필요한 슬롯. `role`은 없을 수 있다 — 추천 API는 슬롯을 지정하지 않고 kind 전체를
 * 물어볼 수 있고, 그때는 어떤 `exact_role` target도 맞지 않는다.
 */
export type AdminAssetMatchSlot = {
  readonly role?: ThemeResourceRole;
  readonly kind: AdminAssetKind;
};

/**
 * 판정에 필요한 에셋. `targets`가 비어 있을 때만 `platform`/`slotRole`을 legacy target으로 쓴다.
 *
 * `CanonicalAdminAsset`에는 그 두 필드가 없다(대표 target에서 파생되는 값이라 `AdminAssetCandidate`
 * 에만 있다). 대신 `parseTargets`가 legacy 행에도 target을 하나 만들어 주므로, 추천 API는 두 필드
 * 없이도 같은 판정을 받는다.
 */
export type AdminAssetMatchInput = Pick<AdminAssetCandidate, "assetKind" | "enabled" | "targets"> &
  Partial<Pick<AdminAssetCandidate, "platform" | "slotRole">>;

export type AdminAssetTargetMatch = {
  readonly target: AdminAssetTarget;
  readonly rank: AdminAssetMatchRank;
};

/**
 * 이 에셋을 이 슬롯에 추천할 근거가 되는 target 하나와 그 순위.
 *
 * **이 함수가 "추천 가능한가"의 유일한 판정이다.** 추천 API(피커에 무엇을 내려줄지)와 export
 * 게이트(그 선택을 결과물에 넣어도 되는지)가 같은 답을 내야 한다. 갈라지면 피커에는 보이는데
 * 내보내기가 403이 되거나, 반대로 피커에 없는 자산이 결과물에 들어간다.
 *
 * 한 에셋이 여러 target과 맞으면 가장 좋은 것 하나만 고른다 — 순위가 낮은 쪽이 먼저이고,
 * 같으면 우선순위가 높은 쪽이다. 피커는 한 에셋을 한 번만 보여 주므로 고르는 일이 필요하다.
 */
export function selectAdminAssetTargetMatch(
  slot: AdminAssetMatchSlot,
  asset: AdminAssetMatchInput,
  platform: ThemePlatform,
  options: { readonly allowCompatibleExactRole?: boolean } = {},
): AdminAssetTargetMatch | undefined {
  let best: AdminAssetTargetMatch | undefined;
  for (const target of resolveMatchTargets(asset)) {
    // enabled는 과거 운영 토글의 잔여 컬럼이다. 현재는 등록된 후보를 모두 사용하고
    // 플랫폼/target 종류만 호환성의 근거로 삼는다.
    if (target.platform !== "all" && target.platform !== platform) continue;
    const rank = getTargetMatchRank(slot, target, asset.assetKind, options.allowCompatibleExactRole ?? false);
    if (rank === undefined) continue;
    if (!best || rank < best.rank || (rank === best.rank && target.priority > best.target.priority)) {
      best = { target, rank };
    }
  }
  return best;
}

/**
 * 적용 범위를 사람이 읽는 문장으로.
 *
 * 관리자 화면이 "이 후보가 어디에 쓰이는가"를 카드·저장 확인 다이얼로그·사이드바에서 각각
 * 보여 주는데, 그 문구가 갈라지면 같은 에셋이 화면마다 다른 범위로 읽힌다.
 */
export function formatAdminAssetPlatformLabel(platform: AdminAssetPlatform) {
  return platform === "all" ? "Android+iOS" : platform === "android" ? "Android" : "iOS";
}

/** kind 하나가 덮는 슬롯들을 요약한다. 넷 이상이면 앞 둘만 적고 나머지는 수로 줄인다. */
export function formatAdminAssetScope(slots: readonly ThemeAssetSlot[]) {
  const labels = Array.from(new Set(slots.map((slot) => slot.label)));
  if (labels.length === 0) return "적용 슬롯 없음";
  if (labels.length <= 3) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} 외 ${labels.length - 2}개`;
}

/** 슬롯을 못 찾으면 role 문자열을 그대로 보여 준다 — 빈칸보다 낫다. */
export function getAdminAssetSlotLabel(role: string, slots: readonly ThemeAssetSlot[]) {
  return slots.find((slot) => slot.role === role)?.label ?? role;
}

/** 문구에 필요한 만큼만. 목록 DTO의 축약 target과 저장 입력 target을 모두 받는다. */
export type FormattableAdminAssetTarget = Pick<AdminAssetTargetInput, "platform" | "slotRole" | "targetKind">;

export function formatAdminAssetTarget(
  target: FormattableAdminAssetTarget,
  slots: readonly ThemeAssetSlot[],
  assetKind?: AdminAssetKind,
) {
  const platformLabel = formatAdminAssetPlatformLabel(target.platform);
  if (target.slotRole) return `${platformLabel} · ${getAdminAssetSlotLabel(target.slotRole, slots)}`;
  if (target.targetKind === "asset_kind") return `${platformLabel} · ${assetKind ? getAdminAssetKindLabel(assetKind) : "해당 분류"} 전체`;
  if (target.targetKind === "shape_rule") return `${platformLabel} · 조건에 맞는 슬롯`;
  return `${platformLabel} · 적용 슬롯`;
}

export function formatAdminAssetTargetsFromInputs(
  targets: readonly FormattableAdminAssetTarget[],
  slots: readonly ThemeAssetSlot[],
  assetKind?: AdminAssetKind,
) {
  if (targets.length < 1) return "적용 슬롯 없음";
  return targets.map((target) => formatAdminAssetTarget(target, slots, assetKind)).join(" / ");
}

/** target이 없는 옛 행은 부모 컬럼으로 문장을 만든다. */
export function formatAdminAssetTargets(
  asset: Pick<AdminAssetCandidate, "platform" | "slotRole" | "assetKind"> & { readonly targets?: readonly FormattableAdminAssetTarget[] },
  slots: readonly ThemeAssetSlot[],
) {
  const targets = asset.targets ?? [];
  if (targets.length < 1) return `${formatAdminAssetPlatformLabel(asset.platform)} · ${getAdminAssetSlotLabel(asset.slotRole, slots)}`;
  return targets.map((target) => formatAdminAssetTarget(target, slots, asset.assetKind)).join(" / ");
}

/**
 * 관리자 화면에서 새 후보를 저장할 때 붙이는 target.
 *
 * **슬롯을 고정하지 않는다.** 어떤 슬롯에 쓸지는 `/edit`에서 사용자가 고르는 일이고, 관리자는
 * "이 종류의 후보"로만 등록한다. 말풍선도 마찬가지다 — 편집기가 좌우반전(`bubbleFlipX`)을
 * 비파괴로 지원하므로 `bubble_me_1`용으로 만든 그림을 `bubble_you_1`에서도 쓸 수 있다.
 *
 * 예전에는 일반 업로드·빌더·기존 후보 전환이 각자 같은 값을 만드는 함수를 따로 들고 있었다.
 * 셋이 갈라지면 등록 경로에 따라 적용 범위가 달라진다.
 */
export function createAdminAssetSaveTargets(): AdminAssetTargetInput[] {
  return [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }];
}

export function createAdminAssetWorkspaceSlots(platformSlots: Readonly<Record<ThemePlatform, readonly ThemeAssetSlot[]>>): AdminAssetWorkspaceSlot[] {
  const slots = new Map<ThemeResourceRole, AdminAssetWorkspaceSlot>();
  for (const platform of ["android", "ios"] as const) {
    for (const slot of platformSlots[platform]) {
      if (slot.kind !== "image" && slot.kind !== "ninepatch") continue;
      const existing = slots.get(slot.role);
      if (existing) {
        slots.set(slot.role, { ...existing, variants: { ...existing.variants, [platform]: slot } });
        continue;
      }
      slots.set(slot.role, {
        key: slot.role,
        role: slot.role,
        kind: inferAdminAssetKind(slot),
        label: slot.label,
        variants: { [platform]: slot },
      });
    }
  }
  return [...slots.values()];
}

export function getAdminAssetWorkspaceSlotVariant(slot: AdminAssetWorkspaceSlot, platform: ThemePlatform): ThemeAssetSlot | undefined {
  return slot.variants[platform] ?? slot.variants[platform === "android" ? "ios" : "android"];
}

export function getAdminAssetCandidateMatchRank(
  slot: AdminAssetMatchSlot,
  asset: AdminAssetMatchInput,
  platform: ThemePlatform,
  options: { readonly allowCompatibleExactRole?: boolean } = {},
): AdminAssetMatchRank | undefined {
  return selectAdminAssetTargetMatch(slot, asset, platform, options)?.rank;
}

function getTargetMatchRank(
  slot: AdminAssetMatchSlot,
  target: Pick<AdminAssetTarget, "targetKind" | "slotRole">,
  assetKind?: AdminAssetKind,
  allowCompatibleExactRole = false,
): AdminAssetMatchRank | undefined {
  if (target.targetKind === "exact_role") {
    // 슬롯을 지정하지 않은 조회이거나 target에 role이 없으면 "정확히 그 슬롯"을 증명할 수 없다.
    if (!slot.role || !target.slotRole) return undefined;
    if (target.slotRole === slot.role) return 0;
    return allowCompatibleExactRole && isCompatibleRole(slot.kind, target.slotRole, slot.role) ? 1 : undefined;
  }
  // `exact_role`이 아닌 target에 role이 박혀 있으면 저장 시 검증(`validateTarget`)을 통과할 수 없는
  // 형태다. 그런 행은 어느 슬롯을 뜻하는지 알 수 없으므로 근거로 쓰지 않는다.
  if (target.slotRole) return undefined;
  if (target.targetKind === "asset_kind") return assetKind === slot.kind ? 1 : undefined;
  if (target.targetKind === "shape_rule") return assetKind === slot.kind ? 2 : undefined;
  return undefined;
}

/**
 * child target이 아직 없는 legacy 행만 부모 컬럼으로 target 하나를 만든다.
 *
 * `platform`/`slotRole`을 모르는 호출부(추천 API의 `CanonicalAdminAsset`)에서는 만들지 않는다.
 * 그 경로는 `parseTargets`가 이미 같은 legacy target을 채워 넣은 뒤라 중복이고, 없는 값을
 * 지어내면 판정이 넓어진다.
 */
function resolveMatchTargets(asset: AdminAssetMatchInput): readonly AdminAssetTarget[] {
  if (asset.targets?.length) return asset.targets;
  if (!asset.platform || !asset.slotRole) return [];
  return [
    {
      platform: asset.platform,
      slotRole: asset.slotRole,
      targetKind: "exact_role",
      priority: 0,
      enabled: asset.enabled,
    },
  ];
}

function isCompatibleRole(assetKind: AdminAssetKind, targetRole: string, requestedRole: string): boolean {
  if (assetKind === "bubble") return targetRole.startsWith("bubble_") && requestedRole.startsWith("bubble_");
  if (assetKind === "background") return isSharedBackgroundRole(targetRole) && isSharedBackgroundRole(requestedRole);
  if (assetKind === "icon") return targetRole.startsWith("tab_icon_") && requestedRole.startsWith("tab_icon_");
  if (assetKind === "passcode_indicator") return targetRole.startsWith("passcode_indicator") && requestedRole.startsWith("passcode_indicator");
  return false;
}

function isSharedBackgroundRole(role: string): boolean {
  return role === "main_background" || role === "chat_background" || role === "tab_background_image";
}
