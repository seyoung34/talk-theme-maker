import { describe, expect, it } from "vitest";
import { buildAdminAssetUsageIndex } from "./adminAssetUsage";

const id = "11111111-2222-4333-8444-555555555555";
const row = (variantId: string, bundleId: string, platform: string, refs: unknown) => ({ id: variantId, platform, upload_refs: refs, system_template_bundles: { id: bundleId, title: "Same title", status: "published", visibility: "public" } });

describe("admin asset usage reverse index", () => {
  it("deduplicates slots and variants by bundle identity, not title", () => {
    const entry = { catalog: { assetId: `admin:${id}` } };
    const result = buildAdminAssetUsageIndex([row("a", "one", "android", { bg: [entry, entry] }), row("b", "one", "ios", { icon: [entry] }), row("c", "two", "android", { bg: [entry] })]);
    expect(result.byAssetId[id]).toHaveLength(2);
    expect(result.byAssetId[id][0].variants).toHaveLength(2);
    expect(result.byAssetId[id][0].variants[0].slots).toEqual(["bg"]);
  });
  it("recognizes legacy original paths but never guesses from filenames", () => {
    const result = buildAdminAssetUsageIndex([row("a", "one", "ios", { bg: [{ imageEdit: { originalStoragePath: `admin-assets/${id}/old.png` } }], icon: [{ fileName: `${id}.png`, storagePath: "system-templates/copy.png" }] })], false);
    expect(result.byAssetId[id][0].variants[0].slots).toEqual(["bg"]);
    expect(result.unknownReferences).toBe(1);
    expect(result.complete).toBe(false);
  });
  it("does not interpret arbitrary catalog keys as admin identities", () => {
    const result = buildAdminAssetUsageIndex([row("a", "one", "android", { bg: [{ catalog: { assetId: "admin:__proto__" } }] })]);
    expect(Object.keys(result.byAssetId)).toEqual([]);
    expect(result.unknownReferences).toBe(1);
  });
});
