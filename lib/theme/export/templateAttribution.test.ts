import { expect, it } from "vitest";
import { normalizeTemplateAttribution, readTemplateAttribution } from "./templateAttribution";
const bundle = "abcdef01-2345-6789-abcd-ef0123456789";
const variant = "abcdef02-2345-6789-abcd-ef0123456789";
it("normalizes UUIDs and suppresses orphan variant IDs", () => {
  expect(normalizeTemplateAttribution(bundle.toUpperCase(), variant)).toEqual({ systemTemplateBundleId: bundle, systemTemplateVariantId: variant });
  for (const invalid of [undefined, null, "", "basic", " " + bundle, bundle + "\n", "x".repeat(1000), new Blob()]) {
    expect(normalizeTemplateAttribution(invalid, variant)).toEqual({ systemTemplateBundleId: null, systemTemplateVariantId: null });
  }
  expect(normalizeTemplateAttribution(bundle, "invalid")).toEqual({ systemTemplateBundleId: bundle, systemTemplateVariantId: null });
});
it("treats absent fields and file fields as null metadata", () => {
  const form = new FormData();
  expect(readTemplateAttribution(form)).toEqual({ systemTemplateBundleId: null, systemTemplateVariantId: null });
  form.set("systemTemplateBundleId", new Blob([bundle]));
  expect(readTemplateAttribution(form).systemTemplateBundleId).toBeNull();
});
