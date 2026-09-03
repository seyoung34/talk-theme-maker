import type {
  AdminAssetAnalysis,
  AdminAssetCandidate,
  AdminAssetKind,
  AdminAssetPlatform,
  AdminAssetTargetKind,
} from "@/lib/theme/adminAssetDomain";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

/**
 * `/admin/assets` 목록 전용 계약.
 *
 * 편집용 `AdminAssetCandidate`와 **일부러 다른 타입이다.** 그쪽은 한 에셋을 고쳐 쓰기 위한
 * 모든 것을 들고 있다 — canonical/variant Storage path, target 원문, 말풍선 spec·design·
 * decoration, catalog pointer. 목록은 카드 수십 장을 한 번에 그리는 화면이라 그 대부분이
 * 낭비이고, Storage path와 원본 signed URL은 애초에 브라우저로 나가면 안 된다.
 *
 * 그래서 목록은 이 축약형만 받고, 원본과 편집용 관계 데이터는 상세 화면을 열 때
 * `getAdminAssetCandidate(id)`로 그 한 건만 받는다.
 */

/**
 * 카드가 "적용 범위"를 문장으로 그리는 데 필요한 만큼만 남긴 target.
 *
 * `id`/`assetId`/`priority`/legacy enabled는 빼도 화면이 그려진다. 순위와 legacy 상태는
 * 후보를 고르는 내부 계약의 잔여 필드이지 목록이 보여 줄 값이 아니다.
 */
export type AdminAssetListTarget = {
  readonly platform: AdminAssetPlatform;
  readonly slotRole?: ThemeResourceRole;
  readonly targetKind: AdminAssetTargetKind;
};

export type AdminAssetListItem = {
  readonly id: string;
  readonly title: string;
  readonly assetKind?: AdminAssetKind;
  /** 대표 target에서 온 값. `asset_kind`가 비어 있는 옛 행의 카드 라벨에만 쓴다. */
  readonly slotRole: ThemeResourceRole;
  readonly platform: AdminAssetPlatform;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly analysis?: AdminAssetAnalysis;
  /** 조정값 자체는 상세에서만 쓴다. 목록은 있는지 여부만 배지로 그린다. */
  readonly hasBubbleAdjustment: boolean;
  readonly targets: readonly AdminAssetListTarget[];
  /** 플랫폼 전용 원본을 가진 platform. 없으면 canonical 하나만 쓰는 에셋이다. */
  readonly variantPlatforms: readonly ThemePlatform[];
  /**
   * 공개 R2 축소본. catalog에 active revision이 있고 `picker` preset이 구워졌을 때만 붙는다.
   *
   * 이게 있으면 카드는 원본을 내려받지 않는다. 목록 전체를 한 번에 그리는 화면이라 이
   * 차이가 곧 화면 로딩 비용이다.
   */
  readonly thumbnailUrl?: string;
  /**
   * 썸네일이 없는 에셋에만 붙는 원본 signed URL.
   *
   * 비-PNG이거나 아직 publish되지 않아 축소본이 없는 에셋이 카드에서 빈칸으로 보이지 않게
   * 하는 폴백이다. 썸네일이 있으면 **주지 않는다** — 주는 순간 절감이 사라진다.
   */
  readonly previewUrl?: string;
};

export type AdminAssetListPayload = {
  readonly items: readonly AdminAssetListItem[];
  /**
   * 상한에 걸려 전체를 담지 못했는가.
   *
   * `true`면 화면은 총 개수와 정렬 결과를 "전체 기준"으로 설명하면 안 된다. 조용히 잘린
   * 목록을 성공처럼 보여 주면 운영자가 없는 에셋을 없다고 판단한다.
   */
  readonly truncated: boolean;
};

/**
 * 편집용 후보를 목록 항목으로 좁힌다.
 *
 * 입력이 `AdminAssetCandidate`인 이유는 `slotRole`/`platform`을 대표 target에서 뽑는 규칙
 * (`selectRepresentativeTarget`)을 여기서 다시 구현하지 않기 위해서다. 파싱과 대표값 선택은
 * 이미 `mapCanonicalAdminAssetRow` → `canonicalAdminAssetToCandidate`가 한다.
 */
export function toAdminAssetListItem(
  asset: AdminAssetCandidate,
  urls: { readonly thumbnailUrl?: string; readonly previewUrl?: string } = {},
): AdminAssetListItem {
  return {
    id: asset.id,
    title: asset.title,
    ...(asset.assetKind ? { assetKind: asset.assetKind } : {}),
    slotRole: asset.slotRole,
    platform: asset.platform,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    ...(asset.analysis ? { analysis: asset.analysis } : {}),
    hasBubbleAdjustment: Boolean(asset.bubbleAdjustment),
    targets: (asset.targets ?? []).map((target) => ({
      platform: target.platform,
      ...(target.slotRole ? { slotRole: target.slotRole } : {}),
      targetKind: target.targetKind,
    })),
    variantPlatforms: (asset.variants ?? []).map((variant) => variant.platform),
    // 썸네일이 있으면 원본 URL을 함께 주지 않는다. 둘 다 주면 카드가 원본을 받을 수 있다.
    ...(urls.thumbnailUrl ? { thumbnailUrl: urls.thumbnailUrl } : urls.previewUrl ? { previewUrl: urls.previewUrl } : {}),
  };
}

/** 목록 카드가 배경으로 그릴 URL. 축소본이 우선이고, 없으면 원본 폴백이다. */
export function adminAssetListTileUrl(item: Pick<AdminAssetListItem, "thumbnailUrl" | "previewUrl">): string | undefined {
  return item.thumbnailUrl ?? item.previewUrl;
}

/**
 * 이 에셋이 어디까지 적용되는가.
 *
 * 운영자가 카드에서 알아야 하는 건 "종류 전체에 쓰이는 기본 후보인가, 특정 슬롯에만 걸어 둔
 * 것인가"다. 지금 저장 경로는 항상 kind 전체 target을 만들므로 `role`은 그 이전에 등록된
 * 에셋을 뜻하고, 편집 화면의 "kind 전체로 전환"으로 옮길 수 있다.
 */
export type AdminAssetScope = "kind_wide" | "role_specific" | "mixed" | "none";

export function describeAdminAssetScope(targets: readonly AdminAssetListTarget[]): AdminAssetScope {
  if (!targets.length) return "none";
  const hasKindWide = targets.some((target) => target.targetKind !== "exact_role");
  const hasRoleSpecific = targets.some((target) => target.targetKind === "exact_role");
  if (hasKindWide && hasRoleSpecific) return "mixed";
  return hasKindWide ? "kind_wide" : "role_specific";
}

export function getAdminAssetScopeLabel(scope: AdminAssetScope): string {
  if (scope === "kind_wide") return "분류 전체";
  if (scope === "role_specific") return "슬롯 지정";
  if (scope === "mixed") return "혼합";
  return "적용 없음";
}

export const adminAssetListSortKeys = ["updated", "created", "title"] as const;
export type AdminAssetListSortKey = (typeof adminAssetListSortKeys)[number];

export const adminAssetListSortDirections = ["asc", "desc"] as const;
export type AdminAssetListSortDirection = (typeof adminAssetListSortDirections)[number];

export function isAdminAssetListSortKey(value: unknown): value is AdminAssetListSortKey {
  return typeof value === "string" && (adminAssetListSortKeys as readonly string[]).includes(value);
}

export function isAdminAssetListSortDirection(value: unknown): value is AdminAssetListSortDirection {
  return typeof value === "string" && (adminAssetListSortDirections as readonly string[]).includes(value);
}

/** 기준을 바꿀 때 사용할 자연스러운 기본 방향. 날짜는 최신, 이름은 가나다 순이다. */
export function getAdminAssetListDefaultSortDirection(sort: AdminAssetListSortKey): AdminAssetListSortDirection {
  return sort === "title" ? "asc" : "desc";
}

/**
 * 목록 정렬.
 *
 * 전량을 받아 두고 클라이언트에서 정렬한다 — 커서 페이지네이션 위에서는 "이름순"이 로드된
 * 페이지 안에서만 성립해서 목록이 거짓말을 한다.
 *
 * 이름은 한국어 정렬(`ko`)을 쓰고, 어느 기준이든 마지막에 `id`로 고정한다. 동률에서 순서가
 * 흔들리면 리렌더마다 카드가 자리를 바꾼다. 방향을 생략하면 기존의 자연스러운 방향
 * (날짜는 최신순, 이름은 가나다순)을 유지한다.
 */
export function sortAdminAssetListItems<T extends Pick<AdminAssetListItem, "id" | "title" | "createdAt" | "updatedAt">>(
  items: readonly T[],
  sort: AdminAssetListSortKey,
  direction: AdminAssetListSortDirection = getAdminAssetListDefaultSortDirection(sort),
): T[] {
  const naturalDirection = getAdminAssetListDefaultSortDirection(sort);
  const directionFactor = direction === naturalDirection ? 1 : -1;
  return [...items].sort((left, right) => directionFactor * compareBySort(left, right, sort) || left.id.localeCompare(right.id));
}

function compareBySort(
  left: Pick<AdminAssetListItem, "title" | "createdAt" | "updatedAt">,
  right: Pick<AdminAssetListItem, "title" | "createdAt" | "updatedAt">,
  sort: AdminAssetListSortKey,
): number {
  if (sort === "title") return left.title.localeCompare(right.title, "ko");
  if (sort === "created") return right.createdAt - left.createdAt;
  return right.updatedAt - left.updatedAt;
}

/** 이름·파일명·slotRole 부분 일치. 정렬로는 대체되지 않는 탐색 수단이라 남긴다. */
export function filterAdminAssetListItems<T extends Pick<AdminAssetListItem, "title" | "fileName" | "slotRole">>(
  items: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...items];
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(normalized) ||
      item.fileName.toLowerCase().includes(normalized) ||
      item.slotRole.toLowerCase().includes(normalized),
  );
}
