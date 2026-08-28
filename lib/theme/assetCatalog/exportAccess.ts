import { getAdminAssetCandidateMatchRank } from "@/lib/theme/adminAssetWorkspace";
import {
  inferAdminAssetKind,
  inferLegacyAssetKind,
  type AdminAssetKind,
  type AdminAssetPlatform,
  type AdminAssetTarget,
  type AdminAssetTargetKind,
} from "@/lib/theme/adminAssetDomain";
import { templateLogicalAssetId } from "@/lib/theme/assetCatalog/logicalAssetId";
import { getImageAssetFallbackRole, getUserUploadShareGroup } from "@/lib/theme/project/state";
import { getThemeSlots } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

/**
 * export 시점에 확인할 관리자 catalog 접근 정보.
 *
 * registry object는 바이트의 위치와 revision을 증명하고, 이 레코드는 그 바이트를 현재
 * 공개 추천 에셋으로 사용할 수 있는지를 증명한다. 둘을 분리해 두어 registry backfill이
 * admin_assets의 enabled/target 정책을 복제하지 않도록 한다.
 */
export type AdminAssetExportAccess = {
  readonly id: string;
  readonly enabled: boolean;
  readonly assetKind?: AdminAssetKind;
  readonly platform: AdminAssetPlatform;
  readonly slotRole: ThemeResourceRole;
  readonly targets: readonly AdminAssetTarget[];
};

/**
 * 시스템 템플릿 upload_refs에 들어 있는 논리 에셋의 export 접근 정보.
 *
 * 두 종류가 들어온다.
 *   - `tpl:<uploadEntryId>` — 템플릿이 직접 올린 에셋
 *   - `admin:<uuid>`        — 운영자가 추천 라이브러리에서 골라 템플릿에 박은 에셋
 *
 * 후자를 함께 담는 것이 핵심이다. **발행된 템플릿은 자기 내용물의 권한 근거**이며, 추천
 * 라이브러리의 현재 정책(`enabled`·타겟)은 피커에 무엇을 보여줄지를 정할 뿐이다. 이렇게 두지
 * 않으면 운영자가 추천 에셋을 지우거나 타겟을 바꾸는 순간 이미 발행된 템플릿의 내보내기가
 * 403이 된다 — catalog 도입 전에는 템플릿이 자기 사본을 들고 있어 일어나지 않던 일이다.
 *
 * 같은 자산이 Android/iOS variant에 함께 있을 수 있으므로 platform별 행으로 보관한다.
 */
export type TemplateAssetExportAccess = {
  readonly logicalAssetId: string;
  readonly platform: ThemePlatform;
  /**
   * 이 자산이 **그 템플릿에서 실제로 놓여 있던** 슬롯의 role.
   *
   * 이게 없으면 템플릿 멤버십이 관리자 ACL을 통째로 대체해 버린다. 말풍선 전용으로 허용된
   * 에셋을 아는 클라이언트가 같은 플랫폼의 탭 바나 배경 슬롯에 넣어 내보낼 수 있다.
   */
  readonly resourceRoles: readonly ThemeResourceRole[];
};

export type CatalogAssetExportAccess =
  | { readonly kind: "admin"; readonly asset: AdminAssetExportAccess }
  | { readonly kind: "template"; readonly rolesByPlatform: Partial<Record<ThemePlatform, readonly ThemeResourceRole[]>> };

export class AdminAssetExportAccessError extends Error {
  constructor(readonly code: "INVALID_ADMIN_ASSET_ACCESS_ROW") {
    super(code);
    this.name = "AdminAssetExportAccessError";
  }
}

const knownResourceRoles = new Set<ThemeResourceRole>([
  ...getThemeSlots("android").map((slot) => slot.role),
  ...getThemeSlots("ios").map((slot) => slot.role),
]);

const imageRolesByPlatform: Readonly<Record<ThemePlatform, ReadonlySet<ThemeResourceRole>>> = {
  android: new Set(getThemeSlots("android").filter((slot) => slot.kind !== "color").map((slot) => slot.role)),
  ios: new Set(getThemeSlots("ios").filter((slot) => slot.kind !== "color").map((slot) => slot.role)),
};

/**
 * role → 그 슬롯이 받는 에셋 종류.
 *
 * `inferLegacyAssetKind(role)`로 대신하면 안 된다. 그 함수는 `group`을 보지 못해 `splash`나
 * `find_add_friend`를 배경으로 분류하는데, 피커가 쓰는 `inferThemeAssetKind(slot)`은 아이콘으로
 * 본다. 두 판정이 갈라지면 피커에서 고를 수 있는 에셋이 내보내기에서 403이 된다.
 *
 * 슬롯을 못 찾을 때만 role 기반 추정으로 떨어진다 — 발행된 템플릿에는 지금 manifest에 없는
 * 옛 role이 남아 있을 수 있고, 그 경우 종전 판정을 유지하는 편이 안전하다.
 */
const assetKindByRole: Readonly<Record<ThemePlatform, ReadonlyMap<ThemeResourceRole, AdminAssetKind>>> = {
  android: new Map(getThemeSlots("android").map((slot) => [slot.role, inferAdminAssetKind(slot)])),
  ios: new Map(getThemeSlots("ios").map((slot) => [slot.role, inferAdminAssetKind(slot)])),
};

function resolveExportSlotKind(platform: ThemePlatform, role: ThemeResourceRole): AdminAssetKind {
  return assetKindByRole[platform].get(role) ?? inferLegacyAssetKind(role);
}

const allowedAssetKinds = new Set<AdminAssetKind>([
  "background",
  "icon",
  "bubble",
  "profile",
  "launcher",
  "passcode",
  "passcode_indicator",
]);

/**
 * 템플릿이 보증하는 role인지 본다.
 *
 * 기록된 role과 정확히 같으면 당연히 허용한다. 여기에 두 가지를 더 연다.
 *
 *   - **공유 그룹**: 사용자 업로드는 말풍선 4칸·전체 배경 3칸·탭 아이콘끼리 공유된다
 *     (`getSharedUploadPeers`). 템플릿이 말풍선 하나에 넣어 둔 에셋을 짝 말풍선에서 쓰는 것은
 *     정상 동작이라, 여기서 막으면 멀쩡한 내보내기가 깨진다.
 *   - **상속**: `profile_image_full_1`은 `profile_image_1`을, focused 탭 아이콘은 기본 아이콘을
 *     상속한다(`getImageAssetFallbackRole`). 이때 manifest에는 상속받는 쪽 role이 실린다.
 *
 * 그 밖의 슬롯은 막는다. 말풍선용 에셋이 탭 바로 넘어가는 경로를 닫는 것이 이 함수의 목적이다.
 */
function isTemplateRoleAllowed(
  recorded: readonly ThemeResourceRole[] | undefined,
  platform: ThemePlatform,
  requested: ThemeResourceRole,
) {
  if (!recorded?.length) return false;
  if (recorded.includes(requested)) return true;

  const inherited = getImageAssetFallbackRole(requested);
  if (inherited && recorded.includes(inherited)) return true;

  const group = shareGroupOfRole(platform, requested);
  if (!group) return false;
  return recorded.some((role) => shareGroupOfRole(platform, role) === group);
}

function shareGroupOfRole(platform: ThemePlatform, role: ThemeResourceRole) {
  return getUserUploadShareGroup(getThemeSlots(platform).find((slot) => slot.role === role));
}

/** service-role query 결과를 export 접근 정책의 최소 계약으로 좁힌다. */
export function mapAdminAssetExportAccessRow(row: unknown): AdminAssetExportAccess {
  const record = requireRecord(row);
  const id = requireNonEmptyString(record.id);
  const slotRole = requireResourceRole(record.slot_role);
  const platform = requirePlatform(record.platform);
  const assetKind = readAssetKind(record.asset_kind);
  const rawTargets = Array.isArray(record.admin_asset_targets) ? record.admin_asset_targets : [];
  const targets = rawTargets.length > 0
    ? rawTargets.map((target) => mapTarget(target, id))
    : [
        {
          assetId: id,
          platform,
          slotRole,
          targetKind: "exact_role" as const,
          priority: 0,
          enabled: readEnabledFlag(record.enabled),
        },
      ];

  return {
    id,
    enabled: readEnabledFlag(record.enabled),
    ...(assetKind ? { assetKind } : {}),
    platform,
    slotRole,
    targets,
  };
}

/** manifest의 resourceRole이 실제 해당 플랫폼의 이미지 슬롯인지 확인한다. */
export function isCatalogExportResourceRole(value: unknown, platform: ThemePlatform): value is ThemeResourceRole {
  return typeof value === "string" && imageRolesByPlatform[platform].has(value as ThemeResourceRole);
}

/** 현재 admin asset 정책으로 해당 catalog ref를 이 export 슬롯에서 사용할 수 있는지 판정한다. */
export function isAdminAssetAllowedForExport(input: {
  asset: AdminAssetExportAccess;
  platform: ThemePlatform;
  resourceRole: ThemeResourceRole;
}) {
  const { asset, platform, resourceRole } = input;

  /**
   * 플랫폼 판정은 target이 한다. enabled는 과거 추천 토글의 잔여 컬럼이므로 현재 후보
   * 가용성에서는 사용하지 않는다.
   *
   * 대표 target(`selectRepresentativeTarget`)의 platform을 여기서 한 번 더 보면, `exact_role(android)`
   * 과 `asset_kind(all)`을 함께 가진 에셋이 iOS에서 거부된다 — 대표로 뽑히는 쪽이 `exact_role`이라
   * platform이 android로 좁혀지기 때문이다. target을 전부 훑는 아래 판정이 `all`/플랫폼 일치를
   * 이미 검사하고, target이 없는 legacy 행은 `asset.platform`으로 만든 target으로 똑같이 막힌다.
   */
  return getAdminAssetCandidateMatchRank(
    { role: resourceRole, kind: resolveExportSlotKind(platform, resourceRole) },
    {
      assetKind: asset.assetKind,
      enabled: asset.enabled,
      platform: asset.platform,
      slotRole: asset.slotRole,
      targets: asset.targets,
    },
    platform,
    { allowCompatibleExactRole: true },
  ) !== undefined;
}

/** registry ref가 관리자 에셋인지 시스템 템플릿 에셋인지에 따라 export 접근을 판정한다. */
export function isCatalogAssetAllowedForExport(input: {
  access: CatalogAssetExportAccess;
  platform: ThemePlatform;
  resourceRole: ThemeResourceRole;
}) {
  if (input.access.kind === "template") {
    return isTemplateRoleAllowed(input.access.rolesByPlatform[input.platform], input.platform, input.resourceRole);
  }
  return isAdminAssetAllowedForExport({
    asset: input.access.asset,
    platform: input.platform,
    resourceRole: input.resourceRole,
  });
}

/**
 * service-role로 읽은 시스템 템플릿 variant를 upload entry id별 export 접근으로 좁힌다.
 *
 * 공개 템플릿은 published/public만, 그 외에는 요청 사용자가 bundle의 created_by와 같을 때만
 * 결과에 넣는다. malformed row는 권한을 부여하지 않고 건너뛰어 fail-closed로 동작한다.
 */
export function mapTemplateAssetExportAccessRows(
  rows: readonly unknown[],
  input: {
    readonly uploadEntryIds: readonly string[];
    /** 템플릿 안에 박힌 `admin:` 논리 자산 id. */
    readonly catalogAssetIds?: readonly string[];
    readonly userId?: string;
  },
): TemplateAssetExportAccess[] {
  const wantedEntryIds = new Set(input.uploadEntryIds.filter((id) => typeof id === "string" && id.trim()));
  const wantedCatalogIds = new Set((input.catalogAssetIds ?? []).filter((id) => typeof id === "string" && id.trim()));
  const seen = new Set<string>();
  const result: TemplateAssetExportAccess[] = [];

  for (const row of rows) {
    const record = readRecord(row);
    if (!record) continue;
    const platform = readThemePlatform(record.platform);
    const bundle = readRecord(Array.isArray(record.system_template_bundles)
      ? record.system_template_bundles[0]
      : record.system_template_bundles);
    if (!platform || !bundle) continue;

    const isPublic = bundle.status === "published" && bundle.visibility === "public";
    const isOwner = typeof input.userId === "string" && input.userId.length > 0 && bundle.created_by === input.userId;
    if (!isPublic && !isOwner) continue;

    // upload_refs는 슬롯 id로 나뉘어 있다. 그 키가 곧 "이 에셋이 어느 자리에 놓였는가"이므로
    // 슬롯별로 훑어 role provenance를 함께 기록한다.
    const refsBySlot = readRecord(record.upload_refs) ?? {};
    const rolesByAssetId = new Map<string, Set<ThemeResourceRole>>();
    for (const [slotId, slotValue] of Object.entries(refsBySlot)) {
      const role = slotRoleById(platform, slotId);
      if (!role) continue;
      const matchedIds = new Set<string>();
      collectLogicalAssetIds(slotValue, wantedEntryIds, wantedCatalogIds, matchedIds);
      for (const logicalAssetId of matchedIds) {
        const roles = rolesByAssetId.get(logicalAssetId) ?? new Set<ThemeResourceRole>();
        roles.add(role);
        rolesByAssetId.set(logicalAssetId, roles);
      }
    }

    for (const [logicalAssetId, roles] of rolesByAssetId) {
      const key = `${logicalAssetId}\u0000${platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ logicalAssetId, platform, resourceRoles: [...roles] });
    }
  }

  return result;
}

function slotRoleById(platform: ThemePlatform, slotId: string): ThemeResourceRole | undefined {
  return getThemeSlots(platform).find((slot) => slot.id === slotId)?.role;
}

function mapTarget(value: unknown, assetId: string): AdminAssetTarget {
  const record = requireRecord(value);
  const targetKind = readTargetKind(record.target_kind);
  const slotRole = record.slot_role === null || typeof record.slot_role === "undefined"
    ? undefined
    : requireResourceRole(record.slot_role);
  if ((targetKind === "exact_role" && !slotRole) || (targetKind !== "exact_role" && slotRole)) {
    throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
  }
  return {
    id: readOptionalString(record.id),
    assetId: readOptionalString(record.asset_id) ?? assetId,
    platform: requirePlatform(record.platform),
    ...(slotRole ? { slotRole } : {}),
    targetKind,
    priority: readInteger(record.priority, 0),
    enabled: readEnabledFlag(record.enabled),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
  }
  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function requireResourceRole(value: unknown): ThemeResourceRole {
  if (typeof value !== "string" || !knownResourceRoles.has(value as ThemeResourceRole)) {
    throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
  }
  return value as ThemeResourceRole;
}

function requirePlatform(value: unknown): AdminAssetPlatform {
  if (value === "android" || value === "ios" || value === "all") return value;
  throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
}

function readAssetKind(value: unknown): AdminAssetKind | undefined {
  if (value === null || typeof value === "undefined") return undefined;
  if (typeof value !== "string" || !allowedAssetKinds.has(value as AdminAssetKind)) {
    throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
  }
  return value as AdminAssetKind;
}

function readTargetKind(value: unknown): AdminAssetTargetKind {
  if (value === "exact_role" || value === "asset_kind") return value;
  throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
}

/**
 * 접근 허용 여부는 **명시적으로 `true`일 때만** 참이다.
 *
 * 값이 없거나 boolean이 아니면 거부한다. 예전에는 `true`로 기본값을 줬는데, 권한 경로에서
 * 기본값이 허용이면 조회가 `enabled`를 빠뜨리는 순간(예: 성능 목적으로 select 목록을 줄일 때)
 * 비활성 에셋이 조용히 통과한다. 지금은 컬럼이 `not null`이라 그런 일이 없지만, 그 사실에
 * 기대는 대신 여기서 닫아 둔다.
 */
function readEnabledFlag(value: unknown) {
  return value === true;
}

function readInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) ? parsed : fallback;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readThemePlatform(value: unknown): ThemePlatform | undefined {
  return value === "android" || value === "ios" ? value : undefined;
}

/**
 * upload_refs(jsonb)를 훑어 이 템플릿이 참조하는 논리 자산 id를 모은다.
 *
 * 슬롯 키가 동적이라 구조를 가정하지 않고 재귀로 내려간다. 업로드 항목은 `id`로, 그 항목이
 * 가리키는 catalog 원본은 `catalog.assetId`로 식별한다.
 */
function collectLogicalAssetIds(
  value: unknown,
  wantedEntryIds: ReadonlySet<string>,
  wantedCatalogIds: ReadonlySet<string>,
  result: Set<string>,
) {
  if (Array.isArray(value)) {
    for (const item of value) collectLogicalAssetIds(item, wantedEntryIds, wantedCatalogIds, result);
    return;
  }
  const record = readRecord(value);
  if (!record) return;

  if (typeof record.id === "string" && wantedEntryIds.has(record.id)) result.add(templateLogicalAssetId(record.id));
  const catalogAssetId = readRecord(record.catalog)?.assetId;
  if (typeof catalogAssetId === "string" && wantedCatalogIds.has(catalogAssetId)) result.add(catalogAssetId);

  for (const child of Object.values(record)) collectLogicalAssetIds(child, wantedEntryIds, wantedCatalogIds, result);
}
