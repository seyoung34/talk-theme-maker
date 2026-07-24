import type { AdminAssetCandidate, AdminAssetKind, AdminAssetTarget } from "@/lib/theme/adminAssetDomain";
import { inferAdminAssetKind } from "@/lib/theme/adminAssetDomain";
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
  slot: Pick<AdminAssetWorkspaceSlot, "role" | "kind">,
  asset: Pick<AdminAssetCandidate, "assetKind" | "enabled" | "platform" | "slotRole" | "targets">,
  platform: ThemePlatform,
  options: { readonly allowCompatibleExactRole?: boolean } = {},
): AdminAssetMatchRank | undefined {
  if (!asset.enabled) return undefined;
  const targets = asset.targets?.length ? asset.targets : [legacyTarget(asset)];
  let best: AdminAssetMatchRank | undefined;
  for (const target of targets) {
    if (!target.enabled || (target.platform !== "all" && target.platform !== platform)) continue;
    const rank = getTargetMatchRank(slot, target, asset.assetKind, options.allowCompatibleExactRole ?? false);
    if (rank !== undefined && (best === undefined || rank < best)) best = rank;
  }
  return best;
}

function getTargetMatchRank(
  slot: Pick<AdminAssetWorkspaceSlot, "role" | "kind">,
  target: Pick<AdminAssetTarget, "targetKind" | "slotRole">,
  assetKind?: AdminAssetKind,
  allowCompatibleExactRole = false,
): AdminAssetMatchRank | undefined {
  if (target.targetKind === "exact_role") {
    if (target.slotRole === slot.role) return 0;
    return allowCompatibleExactRole && target.slotRole && isCompatibleRole(slot.kind, target.slotRole, slot.role) ? 1 : undefined;
  }
  if (target.targetKind === "asset_kind") return assetKind === slot.kind ? 1 : undefined;
  if (target.targetKind === "shape_rule") return assetKind === slot.kind ? 2 : undefined;
  return undefined;
}

function legacyTarget(asset: Pick<AdminAssetCandidate, "platform" | "slotRole" | "enabled">): AdminAssetTarget {
  return {
    platform: asset.platform,
    slotRole: asset.slotRole,
    targetKind: "exact_role",
    priority: 0,
    enabled: asset.enabled,
  };
}

function isCompatibleRole(assetKind: AdminAssetKind, targetRole: string, requestedRole: string): boolean {
  if (assetKind === "bubble") return targetRole.startsWith("bubble_") && requestedRole.startsWith("bubble_");
  if (assetKind === "background") return isSharedBackgroundRole(targetRole) && isSharedBackgroundRole(requestedRole);
  if (assetKind === "icon") return targetRole.startsWith("tab_icon_") && requestedRole.startsWith("tab_icon_");
  return false;
}

function isSharedBackgroundRole(role: string): boolean {
  return role === "main_background" || role === "chat_background" || role === "tab_background_image";
}
