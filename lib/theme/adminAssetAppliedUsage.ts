import { resolveProjectImageSource } from "@/lib/theme/project/assetSource";
import type { SlotCandidateSelections, SlotUploads, SlotUploadEntry } from "@/lib/theme/project/state";
import { getThemeSlots, themeTemplates } from "@/lib/theme/templates";
import { getExplicitAdminAssetIds, type AdminAssetUsageIndex, type AdminAssetUsageVariantRow } from "./adminAssetUsage";

/** Same source selection as preview/export, using identity-only entries without downloading bytes. */
export function annotateAdminAssetAppliedUsage(index: AdminAssetUsageIndex, rows: AdminAssetUsageVariantRow[], knownAdminIds: ReadonlySet<string> = new Set()) {
  const appliedByVariant = new Map<string, Map<string, string[]> | undefined>();
  const referencedVariants = new Set(Object.values(index.byAssetId).flatMap((bundles) => bundles.flatMap((bundle) => bundle.variants.map((variant) => variant.id))));
  for (const row of rows) {
    if (!referencedVariants.has(row.id)) continue;
    try {
      const template = themeTemplates.find((item) => item.id === row.base_template_id);
      if (!template || (row.platform !== "android" && row.platform !== "ios")) continue;
      if (!row.upload_refs || typeof row.upload_refs !== "object" || Array.isArray(row.upload_refs)) continue;
      if (!row.candidate_selections || typeof row.candidate_selections !== "object" || Array.isArray(row.candidate_selections)) continue;
      const selections = row.candidate_selections as SlotCandidateSelections;
      if (Object.values(selections).some((value) => typeof value !== "string")) continue;
      const uploads: SlotUploads = {};
      const provenance = new Map<SlotUploadEntry, string[]>();
      for (const [slot, values] of Object.entries(row.upload_refs)) {
        if (!Array.isArray(values)) throw new Error("Invalid upload refs");
        uploads[slot] = values.map((value: unknown) => {
          if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") throw new Error("Invalid upload identity");
          // Remote template hydration also assigns source:template to every saved entry.
          const entry: SlotUploadEntry = { id: value.id, source: "template" };
          provenance.set(entry, getExplicitAdminAssetIds(value, knownAdminIds));
          return entry;
        });
      }
      const slots = getThemeSlots(row.platform);
      const applied = new Map<string, string[]>();
      for (const slot of slots) {
        if (slot.kind === "color") continue;
        const resolved = resolveProjectImageSource(slot, uploads, selections, template.id, template, slots);
        for (const id of resolved.selectedUpload ? provenance.get(resolved.selectedUpload) ?? [] : []) {
          const roles = applied.get(id) ?? [];
          roles.push(slot.role);
          applied.set(id, roles);
        }
      }
      appliedByVariant.set(row.id, applied);
    } catch {
      appliedByVariant.set(row.id, undefined);
    }
  }
  for (const [assetId, bundles] of Object.entries(index.byAssetId)) {
    for (const bundle of bundles) for (const variant of bundle.variants) {
      const applied = appliedByVariant.get(variant.id);
      if (applied) variant.appliedSlots = applied.get(assetId) ?? [];
    }
  }
  return index;
}
