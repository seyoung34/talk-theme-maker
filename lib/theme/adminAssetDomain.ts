import type { ThemeAssetSlot } from "@/lib/theme/templates";
import type { BubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";
import type { Insets, Markers, StretchPoint, ThemePlatform, ThemeResourceRole } from "@/lib/theme/types";

export type AdminAssetKind = "background" | "icon" | "bubble" | "profile" | "launcher" | "passcode";
export type AdminAssetShape = "square" | "portrait" | "wide" | "transparent" | "ninepatch" | "unknown";
export type AdminAssetPlatform = ThemePlatform | "all";
export type AdminAssetTargetKind = "exact_role" | "asset_kind" | "shape_rule";

export type AdminAssetAnalysis = {
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: number;
  readonly transparentPixelRatio?: number;
  readonly shapes: readonly AdminAssetShape[];
};

export type AdminBubbleAdjustment = {
  readonly markers?: Markers;
  readonly insets?: Insets;
  readonly stretch?: StretchPoint;
};

export type AdminBubbleSpec = {
  readonly androidMarkers: Markers;
  readonly iosInsets: Insets;
  readonly iosStretch: StretchPoint;
};

export type AdminAssetTarget = {
  readonly id?: string;
  readonly assetId?: string;
  readonly platform: AdminAssetPlatform;
  readonly slotRole?: ThemeResourceRole;
  readonly targetKind: AdminAssetTargetKind;
  readonly priority: number;
  readonly enabled: boolean;
};

export type AdminAssetPlatformVariant = {
  readonly id?: string;
  readonly assetId?: string;
  readonly platform: ThemePlatform;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly analysis?: AdminAssetAnalysis;
  readonly previewUrl?: string;
};

export type AdminAssetBubbleDecoration = {
  readonly layerId: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly previewUrl?: string;
};

export type AdminAssetBubbleDesign = {
  readonly recipe: BubbleFamilyDesignSpec;
  readonly geometryMode: "generated" | "manual";
  readonly decorations: readonly AdminAssetBubbleDecoration[];
};

export type AdminAssetCandidate = {
  readonly id: string;
  readonly slotRole: ThemeResourceRole;
  readonly platform: AdminAssetPlatform;
  readonly assetKind?: AdminAssetKind;
  readonly analysis?: AdminAssetAnalysis;
  readonly bubbleAdjustment?: AdminBubbleAdjustment;
  readonly bubbleSpec?: AdminBubbleSpec;
  readonly targets?: readonly AdminAssetTarget[];
  readonly variants?: readonly AdminAssetPlatformVariant[];
  readonly bubbleDesign?: AdminAssetBubbleDesign;
  readonly title: string;
  readonly note?: string;
  readonly tags: string[];
  readonly fileName: string;
  readonly mimeType: string;
  readonly storagePath: string;
  readonly blob?: Blob;
  readonly file?: File;
  readonly previewUrl?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly enabled: boolean;
};

export type AdminAssetTargetInput = Omit<AdminAssetTarget, "id" | "assetId">;

export type AdminAssetCandidateInput = Omit<AdminAssetCandidate, "id" | "createdAt" | "updatedAt" | "enabled" | "storagePath" | "blob" | "previewUrl" | "file" | "targets" | "bubbleSpec"> & {
  readonly id?: string;
  readonly enabled?: boolean;
  readonly blob: Blob;
  readonly targets?: readonly AdminAssetTargetInput[];
  readonly bubbleSpec?: AdminBubbleSpec;
};

export type AdminAssetCandidateUpdate = {
  readonly title: string;
  readonly enabled?: boolean;
  readonly targets?: readonly AdminAssetTargetInput[];
  readonly bubbleSpec?: AdminBubbleSpec;
  readonly bubbleAdjustment?: AdminBubbleAdjustment;
};

export type AdminAssetPage = {
  readonly items: AdminAssetCandidate[];
  readonly nextCursor?: string;
};

export type AdminAssetListOptions = {
  readonly platform?: ThemePlatform;
  readonly assetKind?: AdminAssetKind;
  readonly slotRole?: ThemeResourceRole;
  readonly cursor?: string;
  readonly limit?: number;
  readonly enabledOnly?: boolean;
};

export type CanonicalAdminAsset = {
  readonly id: string;
  readonly assetKind?: AdminAssetKind;
  readonly analysis?: AdminAssetAnalysis;
  readonly bubbleSpec?: AdminBubbleSpec;
  readonly title: string;
  readonly note?: string;
  readonly tags: string[];
  readonly fileName: string;
  readonly mimeType: string;
  readonly storagePath: string;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly targets: readonly AdminAssetTarget[];
  readonly variants: readonly AdminAssetPlatformVariant[];
  readonly bubbleDesign?: AdminAssetBubbleDesign;
};

export type AdminAssetRecommendationItem = CanonicalAdminAsset & {
  readonly target: AdminAssetTarget;
  readonly matchRank: 0 | 1 | 2;
  readonly previewUrl?: string;
};

export type AdminAssetPersistencePayload = {
  readonly asset: {
    readonly id: string;
    readonly slot_role: ThemeResourceRole;
    readonly platform: AdminAssetPlatform;
    readonly asset_kind: AdminAssetKind | null;
    readonly analysis: AdminAssetAnalysis | null;
    readonly bubble_adjustment: AdminBubbleAdjustment | null;
    readonly title: string;
    readonly note: string | null;
    readonly tags: readonly string[];
    readonly file_name: string;
    readonly mime_type: string;
    readonly storage_path: string;
    readonly enabled: boolean;
    readonly created_by?: string | null;
  };
  readonly targets: readonly {
    readonly asset_id: string;
    readonly platform: AdminAssetPlatform;
    readonly slot_role: ThemeResourceRole | null;
    readonly target_kind: AdminAssetTargetKind;
    readonly priority: number;
    readonly enabled: boolean;
  }[];
  readonly bubbleSpec?: {
    readonly asset_id: string;
    readonly android_markers: Markers;
    readonly ios_insets: Insets;
    readonly ios_stretch: StretchPoint;
  };
};

export class AdminAssetDomainError extends Error {
  constructor(readonly code: "INVALID_ASSET_TITLE" | "INVALID_ASSET_TARGET" | "INVALID_BUBBLE_SPEC" | "INVALID_CANONICAL_ASSET_ROW") {
    super(code);
    this.name = "AdminAssetDomainError";
  }
}

export function assertValidAdminAssetCandidateInput(input: AdminAssetCandidateInput): void {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new AdminAssetDomainError("INVALID_ASSET_TITLE");
  const targets = resolveAdminAssetTargets(input);
  if (targets.length < 1) throw new AdminAssetDomainError("INVALID_ASSET_TARGET");
  for (const target of targets) validateTarget(target);
  if (input.assetKind === "bubble") {
    const spec = input.bubbleSpec ?? bubbleAdjustmentToSpec(input.bubbleAdjustment);
    if (!spec || !isValidBubbleSpec(spec)) throw new AdminAssetDomainError("INVALID_BUBBLE_SPEC");
  }
}

export function createAdminAssetPersistencePayload(input: AdminAssetCandidateInput, id: string, storagePath: string, createdBy?: string | null): AdminAssetPersistencePayload {
  assertValidAdminAssetCandidateInput(input);
  const targets = resolveAdminAssetTargets(input);
  const representative = targets[0];
  if (!representative) throw new AdminAssetDomainError("INVALID_ASSET_TARGET");
  const bubbleSpec = input.assetKind === "bubble" ? input.bubbleSpec ?? bubbleAdjustmentToSpec(input.bubbleAdjustment) : undefined;
  const bubbleAdjustment = bubbleSpec ? bubbleSpecToAdjustment(bubbleSpec) : input.bubbleAdjustment;
  return {
    asset: {
      id,
      slot_role: representative.slotRole ?? input.slotRole,
      platform: representative.platform,
      asset_kind: input.assetKind ?? null,
      analysis: input.analysis ?? null,
      bubble_adjustment: bubbleAdjustment ?? null,
      title: input.title.trim(),
      note: input.note?.trim() || null,
      tags: [...input.tags],
      file_name: input.fileName,
      mime_type: input.mimeType || "application/octet-stream",
      storage_path: storagePath,
      enabled: input.enabled ?? true,
      created_by: createdBy ?? null,
    },
    targets: targets.map((target) => ({
      asset_id: id,
      platform: target.platform,
      slot_role: target.slotRole ?? null,
      target_kind: target.targetKind,
      priority: target.priority,
      enabled: target.enabled,
    })),
    bubbleSpec: bubbleSpec
      ? {
          asset_id: id,
          android_markers: bubbleSpec.androidMarkers,
          ios_insets: bubbleSpec.iosInsets,
          ios_stretch: bubbleSpec.iosStretch,
        }
      : undefined,
  };
}

export function mapCanonicalAdminAssetRow(row: unknown): CanonicalAdminAsset {
  const record = requireRecord(row);
  const id = requireString(record.id);
  const title = requireString(record.title).trim();
  if (!title) throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  const targets = parseTargets(record.admin_asset_targets, id, record);
  const variants = parseVariants(record.admin_asset_variants, id);
  const assetKind = parseOptionalAssetKind(record.asset_kind);
  const bubbleSpec = parseOptionalBubbleSpec(record.admin_asset_bubble_specs ?? record.bubble_spec);
  const bubbleDesign = parseBubbleDesign(record.admin_asset_bubble_designs);
  if (assetKind === "bubble" && bubbleSpec && !isValidBubbleSpec(bubbleSpec)) throw new AdminAssetDomainError("INVALID_BUBBLE_SPEC");
  return {
    id,
    assetKind,
    analysis: parseOptionalAnalysis(record.analysis),
    bubbleSpec,
    title,
    note: readOptionalString(record.note),
    tags: readStringArray(record.tags),
    fileName: requireString(record.file_name),
    mimeType: requireString(record.mime_type),
    storagePath: requireString(record.storage_path),
    enabled: readBoolean(record.enabled, true),
    createdAt: dateToMs(readOptionalString(record.created_at)),
    updatedAt: dateToMs(readOptionalString(record.updated_at)),
    targets,
    variants,
    bubbleDesign,
  };
}

export function canonicalAdminAssetToCandidate(
  asset: CanonicalAdminAsset,
  previewUrl?: string,
  variantPreviewUrls: Readonly<Record<string, string>> = {},
): AdminAssetCandidate {
  const representative = selectRepresentativeTarget(asset.targets);
  return {
    id: asset.id,
    slotRole: representative.slotRole ?? legacyRoleFromKind(asset.assetKind),
    platform: representative.platform,
    assetKind: asset.assetKind ?? inferLegacyAssetKind(representative.slotRole ?? legacyRoleFromKind(asset.assetKind)),
    analysis: asset.analysis,
    bubbleAdjustment: asset.bubbleSpec ? bubbleSpecToAdjustment(asset.bubbleSpec) : undefined,
    bubbleSpec: asset.bubbleSpec,
    targets: asset.targets,
    variants: asset.variants.map((variant) => ({ ...variant, previewUrl: variantPreviewUrls[variant.storagePath] })),
    bubbleDesign: asset.bubbleDesign,
    title: asset.title,
    note: asset.note,
    tags: asset.tags,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    storagePath: asset.storagePath,
    previewUrl,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    enabled: asset.enabled,
  };
}

export function selectAdminAssetPlatformVariant(asset: Pick<AdminAssetCandidate, "variants">, platform: ThemePlatform): AdminAssetPlatformVariant | undefined {
  return asset.variants?.find((variant) => variant.platform === platform);
}

export function bubbleSpecToAdjustment(spec: AdminBubbleSpec): AdminBubbleAdjustment {
  return {
    markers: spec.androidMarkers,
    insets: spec.iosInsets,
    stretch: spec.iosStretch,
  };
}

export function bubbleAdjustmentToSpec(adjustment?: AdminBubbleAdjustment): AdminBubbleSpec | undefined {
  if (!adjustment?.markers || !adjustment.insets || !adjustment.stretch) return undefined;
  return {
    androidMarkers: adjustment.markers,
    iosInsets: adjustment.insets,
    iosStretch: adjustment.stretch,
  };
}

export function inferAdminAssetKind(slot: Pick<ThemeAssetSlot, "role" | "group" | "section" | "kind">): AdminAssetKind {
  if (slot.role.startsWith("launcher_")) return "launcher";
  if (slot.role === "theme_icon" || slot.role.startsWith("tab_icon_")) return "icon";
  if (slot.role === "profile_image" || slot.role.startsWith("profile_image_")) return "profile";
  if (slot.role.startsWith("bubble_")) return "bubble";
  if (slot.role.startsWith("passcode_")) return "passcode";
  if (slot.group === "background" || slot.role === "tab_background_image") return "background";
  return "icon";
}

export function inferLegacyAssetKind(role: ThemeResourceRole): AdminAssetKind {
  if (role.startsWith("launcher_")) return "launcher";
  if (role === "theme_icon" || role.startsWith("tab_icon_")) return "icon";
  if (role === "profile_image" || role.startsWith("profile_image_")) return "profile";
  if (role.startsWith("bubble_")) return "bubble";
  if (role.startsWith("passcode_")) return "passcode";
  return "background";
}

export function isValidBubbleAdjustment(value: AdminBubbleAdjustment): boolean {
  return isValidBubbleSpecLike(value.markers, value.insets, value.stretch);
}

function resolveAdminAssetTargets(input: AdminAssetCandidateInput): readonly AdminAssetTargetInput[] {
  if (input.targets && input.targets.length > 0) return input.targets;
  return [
    {
      platform: input.platform,
      slotRole: input.slotRole,
      targetKind: "exact_role",
      priority: 0,
      enabled: input.enabled ?? true,
    },
  ];
}

function validateTarget(target: AdminAssetTargetInput): void {
  if ((target.targetKind === "exact_role" && !target.slotRole) || (target.targetKind !== "exact_role" && target.slotRole)) {
    throw new AdminAssetDomainError("INVALID_ASSET_TARGET");
  }
}

function parseTargets(value: unknown, assetId: string, fallback: Record<string, unknown>): readonly AdminAssetTarget[] {
  const rows = Array.isArray(value) ? value : [];
  const parsed = rows.map((item) => parseTarget(item, assetId));
  if (parsed.length > 0) return parsed;
  return [
    {
      assetId,
      platform: parsePlatform(fallback.platform),
      slotRole: parseThemeResourceRole(fallback.slot_role),
      targetKind: "exact_role",
      priority: 0,
      enabled: readBoolean(fallback.enabled, true),
    },
  ];
}

function parseVariants(value: unknown, assetId: string): readonly AdminAssetPlatformVariant[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = requireRecord(item);
    return {
      id: readOptionalString(record.id),
      assetId: readOptionalString(record.asset_id) ?? assetId,
      platform: parseThemePlatform(record.platform),
      storagePath: requireString(record.storage_path),
      fileName: requireString(record.file_name),
      mimeType: requireString(record.mime_type),
      analysis: parseOptionalAnalysis(record.analysis),
    };
  });
}

function parseBubbleDesign(value: unknown): AdminAssetBubbleDesign | undefined {
  const source = Array.isArray(value) ? value[0] : value;
  if (source == null) return undefined;
  const record = requireRecord(source);
  const recipe = record.recipe;
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  const geometryMode = record.geometry_mode;
  if (geometryMode !== "generated" && geometryMode !== "manual") throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  const decorationRows = record.admin_asset_bubble_decorations;
  const decorations = Array.isArray(decorationRows)
    ? decorationRows.map((item) => {
        const decoration = requireRecord(item);
        return {
          layerId: requireString(decoration.layer_id),
          storagePath: requireString(decoration.storage_path),
          fileName: requireString(decoration.file_name),
          mimeType: requireString(decoration.mime_type),
        };
      })
    : [];
  return { recipe: recipe as BubbleFamilyDesignSpec, geometryMode, decorations };
}

function parseTarget(value: unknown, assetId: string): AdminAssetTarget {
  const record = requireRecord(value);
  const target: AdminAssetTarget = {
    id: readOptionalString(record.id),
    assetId: readOptionalString(record.asset_id) ?? assetId,
    platform: parsePlatform(record.platform),
    slotRole: readOptionalThemeResourceRole(record.slot_role),
    targetKind: parseTargetKind(record.target_kind),
    priority: readInteger(record.priority, 0),
    enabled: readBoolean(record.enabled, true),
  };
  validateTarget(target);
  return target;
}

function parseOptionalBubbleSpec(value: unknown): AdminBubbleSpec | undefined {
  const source = Array.isArray(value) ? value[0] : value;
  if (source == null) return undefined;
  const record = requireRecord(source);
  const spec = {
    androidMarkers: parseMarkers(record.android_markers),
    iosInsets: parseInsets(record.ios_insets),
    iosStretch: parseStretchPoint(record.ios_stretch),
  };
  if (!isValidBubbleSpec(spec)) throw new AdminAssetDomainError("INVALID_BUBBLE_SPEC");
  return spec;
}

function isValidBubbleSpec(value: AdminBubbleSpec): boolean {
  return isValidBubbleSpecLike(value.androidMarkers, value.iosInsets, value.iosStretch);
}

function isValidBubbleSpecLike(markers: Markers | undefined, insets: Insets | undefined, stretch: StretchPoint | undefined): boolean {
  return Boolean(
    markers &&
      isRange(markers.top) &&
      isRange(markers.left) &&
      isRange(markers.right) &&
      isRange(markers.bottom) &&
      insets &&
      Object.values(insets).every(isNonNegativeInteger) &&
      stretch &&
      isNonNegativeInteger(stretch.x) &&
      isNonNegativeInteger(stretch.y),
  );
}

function parseOptionalAnalysis(value: unknown): AdminAssetAnalysis | undefined {
  if (value == null) return undefined;
  const record = requireRecord(value);
  return {
    width: readOptionalNumber(record.width),
    height: readOptionalNumber(record.height),
    aspectRatio: readOptionalNumber(record.aspectRatio),
    transparentPixelRatio: readOptionalNumber(record.transparentPixelRatio),
    shapes: readShapeArray(record.shapes),
  };
}

function parseMarkers(value: unknown): Markers {
  const record = requireRecord(value);
  return {
    top: parseRange(record.top),
    left: parseRange(record.left),
    right: parseRange(record.right),
    bottom: parseRange(record.bottom),
  };
}

function parseRange(value: unknown): { readonly start: number; readonly end: number } {
  const record = requireRecord(value);
  return { start: requireInteger(record.start), end: requireInteger(record.end) };
}

function parseInsets(value: unknown): Insets {
  const record = requireRecord(value);
  return {
    top: requireInteger(record.top),
    right: requireInteger(record.right),
    bottom: requireInteger(record.bottom),
    left: requireInteger(record.left),
  };
}

function parseStretchPoint(value: unknown): StretchPoint {
  const record = requireRecord(value);
  return { x: requireInteger(record.x), y: requireInteger(record.y) };
}

function selectRepresentativeTarget(targets: readonly AdminAssetTarget[]): AdminAssetTarget {
  const exact = targets.find((target) => target.targetKind === "exact_role" && target.slotRole);
  const enabled = targets.find((target) => target.enabled);
  const fallback = targets[0];
  if (exact) return exact;
  if (enabled) return enabled;
  if (fallback) return fallback;
  throw new AdminAssetDomainError("INVALID_ASSET_TARGET");
}

function legacyRoleFromKind(kind?: AdminAssetKind): ThemeResourceRole {
  if (kind === "bubble") return "bubble_me_1";
  if (kind === "profile") return "profile_image";
  if (kind === "launcher") return "launcher_foreground";
  if (kind === "passcode") return "passcode_background";
  if (kind === "background") return "main_background";
  return "theme_icon";
}

function parseOptionalAssetKind(value: unknown): AdminAssetKind | undefined {
  if (value == null) return undefined;
  if (value === "background" || value === "icon" || value === "bubble" || value === "profile" || value === "launcher" || value === "passcode") return value;
  throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
}

function parsePlatform(value: unknown): AdminAssetPlatform {
  if (value === "android" || value === "ios" || value === "all") return value;
  throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
}

function parseThemePlatform(value: unknown): ThemePlatform {
  if (value === "android" || value === "ios") return value;
  throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
}

function parseTargetKind(value: unknown): AdminAssetTargetKind {
  if (value === "exact_role" || value === "asset_kind" || value === "shape_rule") return value;
  throw new AdminAssetDomainError("INVALID_ASSET_TARGET");
}

function parseThemeResourceRole(value: unknown): ThemeResourceRole {
  const role = requireString(value);
  if (!role) throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  return role as ThemeResourceRole;
}

function readOptionalThemeResourceRole(value: unknown): ThemeResourceRole | undefined {
  if (value == null) return undefined;
  return parseThemeResourceRole(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readShapeArray(value: unknown): AdminAssetShape[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAdminAssetShape);
}

function isAdminAssetShape(value: unknown): value is AdminAssetShape {
  return value === "square" || value === "portrait" || value === "wide" || value === "transparent" || value === "ninepatch" || value === "unknown";
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new AdminAssetDomainError("INVALID_CANONICAL_ASSET_ROW");
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}

function requireInteger(value: unknown): number {
  if (!Number.isInteger(value)) throw new AdminAssetDomainError("INVALID_BUBBLE_SPEC");
  return Number(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isRange(value: { readonly start: number; readonly end: number }): boolean {
  return isNonNegativeInteger(value.start) && isNonNegativeInteger(value.end) && value.start < value.end;
}

function dateToMs(value?: string): number {
  return value ? new Date(value).getTime() : Date.now();
}
