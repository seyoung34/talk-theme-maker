// @vitest-environment node
import { describe, expect, it } from "vitest";
import { annotateAdminAssetAppliedUsage } from "./adminAssetAppliedUsage";
import { buildAdminAssetUsageIndex, type AdminAssetUsageVariantRow } from "./adminAssetUsage";
import { getThemeSlots } from "./templates";

const assetId = "11111111-2222-4333-8444-555555555555";
const slots = getThemeSlots("android");
const source = slots.find((slot) => slot.role === "bubble_me_1")!;
const target = slots.find((slot) => slot.role === "bubble_me_2")!;
const makeRow = (selections: Record<string, string>): AdminAssetUsageVariantRow => ({
  id: "variant", platform: "android", base_template_id: "basic", candidate_selections: selections,
  upload_refs: { [source.id]: [{ id: "upload", catalog: { assetId: `admin:${assetId}` } }] },
  system_template_bundles: { id: "bundle", title: "Template" },
});
const run = (row: AdminAssetUsageVariantRow) => annotateAdminAssetAppliedUsage(buildAdminAssetUsageIndex([row]), [row]).byAssetId[assetId][0].variants[0];

describe("actual admin asset application", () => {
  it("resolves copied candidates using known saved admin identities", () => {
    const row = makeRow({ [source.id]: assetId });
    row.upload_refs = { [source.id]: [{ id: assetId, storagePath: "system-templates/copy.png" }] };
    const known = new Set([assetId]);
    const index = annotateAdminAssetAppliedUsage(buildAdminAssetUsageIndex([row], true, known), [row], known);
    expect(index.byAssetId[assetId][0].variants[0].appliedSlots).toContain(source.role);
  });
  it("resolves selected uploads using the server-safe canonical reader", () => {
    expect(run(makeRow({ [source.id]: "upload" })).appliedSlots).toContain(source.role);
  });
  it("distinguishes stored candidates from applied sources", () => {
    expect(run(makeRow({})).appliedSlots).toEqual([]);
  });
  it("resolves a shared upload selected from a peer bucket", () => {
    expect(run(makeRow({ [target.id]: "upload" })).appliedSlots).toContain(target.role);
  });
  it("honors an explicitly disabled slot", () => {
    expect(run(makeRow({ [source.id]: "__none__" })).appliedSlots).not.toContain(source.role);
  });
  it("resolves inherited profile image sources", () => {
    const profile = slots.find((slot) => slot.role === "profile_image_1")!;
    const fullProfile = slots.find((slot) => slot.role === "profile_image_full_1")!;
    const row = makeRow({ [profile.id]: "upload" });
    row.upload_refs = { [profile.id]: [{ id: "upload", catalog: { assetId: `admin:${assetId}` } }] };
    expect(run(row).appliedSlots).toContain(fullProfile.role);
  });
  it.each([100, 1000])("records identity-only resolution cost for %s variants", (count) => {
    const rows = Array.from({ length: count }, (_, n) => ({ ...makeRow({ [source.id]: "upload" }), id: `variant-${n}` }));
    const start = performance.now();
    const index = annotateAdminAssetAppliedUsage(buildAdminAssetUsageIndex(rows), rows);
    console.info(`Admin applied usage ${count} variants: ${(performance.now() - start).toFixed(1)}ms`);
    expect(index.byAssetId[assetId][0].variants).toHaveLength(count);
    expect(index.byAssetId[assetId][0].variants.every((item) => item.appliedSlots?.includes(source.role))).toBe(true);
  });
  it("keeps stored provenance when selection cannot be resolved", () => {
    const row = makeRow({}); row.base_template_id = "unknown";
    const variant = run(row);
    expect(variant.slots).toEqual([source.id]);
    expect(variant.appliedSlots).toBeUndefined();
  });
});
