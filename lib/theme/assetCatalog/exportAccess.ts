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
