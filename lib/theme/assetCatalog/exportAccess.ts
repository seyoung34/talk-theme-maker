import { getAdminAssetCandidateMatchRank } from "@/lib/theme/adminAssetWorkspace";
import {
  inferLegacyAssetKind,
  type AdminAssetKind,
  type AdminAssetPlatform,
  type AdminAssetTarget,
  type AdminAssetTargetKind,
} from "@/lib/theme/adminAssetDomain";
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
 * template logical id는 업로드 항목 id만 알고 있어도 variant의 upload_refs에서 찾을 수 있다.
 * 같은 항목 id가 Android/iOS variant에 함께 있을 수 있으므로 platform별 행으로 보관한다.
 */
export type TemplateAssetExportAccess = {
  readonly uploadEntryId: string;
  readonly platform: ThemePlatform;
};

export type CatalogAssetExportAccess =
  | { readonly kind: "admin"; readonly asset: AdminAssetExportAccess }
  | { readonly kind: "template"; readonly platforms: readonly ThemePlatform[] };

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

const allowedAssetKinds = new Set<AdminAssetKind>([
  "background",
  "icon",
  "bubble",
  "profile",
  "launcher",
  "passcode",
  "passcode_indicator",
]);

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
          enabled: readBoolean(record.enabled, true),
        },
      ];

  return {
    id,
    enabled: readBoolean(record.enabled, true),
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
  if (!asset.enabled || (asset.platform !== "all" && asset.platform !== platform)) return false;

  const slotKind = inferLegacyAssetKind(resourceRole);
  return getAdminAssetCandidateMatchRank(
    { role: resourceRole, kind: slotKind },
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
  if (input.access.kind === "template") return input.access.platforms.includes(input.platform);
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
  input: { readonly uploadEntryIds: readonly string[]; readonly userId?: string },
): TemplateAssetExportAccess[] {
  const wanted = new Set(input.uploadEntryIds.filter((id) => typeof id === "string" && id.trim()));
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

    const matchedIds = new Set<string>();
    collectUploadEntryIds(record.upload_refs, wanted, matchedIds);
    for (const uploadEntryId of matchedIds) {
      const key = `${uploadEntryId}\u0000${platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ uploadEntryId, platform });
    }
  }

  return result;
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
    enabled: readBoolean(record.enabled, true),
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
  if (value === "exact_role" || value === "asset_kind" || value === "shape_rule") return value;
  throw new AdminAssetExportAccessError("INVALID_ADMIN_ASSET_ACCESS_ROW");
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
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

function collectUploadEntryIds(value: unknown, wanted: ReadonlySet<string>, result: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectUploadEntryIds(item, wanted, result);
    return;
  }
  const record = readRecord(value);
  if (!record) return;

  if (typeof record.id === "string" && wanted.has(record.id)) result.add(record.id);
  for (const child of Object.values(record)) collectUploadEntryIds(child, wanted, result);
}
