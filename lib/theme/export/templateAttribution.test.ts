import { expect, it } from "vitest";
import { normalizeTemplateAttribution, readSourceTemplateBundleId, readTemplateAttribution } from "./templateAttribution";
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

it("reads the derived source bundle separately and rejects non-UUID or file fields", () => {
  const form = new FormData();
  expect(readSourceTemplateBundleId(form)).toBeNull();
  form.set("sourceSystemTemplateBundleId", bundle.toUpperCase());
  expect(readSourceTemplateBundleId(form)).toBe(bundle);
  form.set("sourceSystemTemplateBundleId", "pastel-glass");
  expect(readSourceTemplateBundleId(form)).toBeNull();
  form.set("sourceSystemTemplateBundleId", new Blob([bundle]));
  expect(readSourceTemplateBundleId(form)).toBeNull();
  // 기존 직접 사용 필드의 반환 형태는 바뀌지 않는다.
  expect(readTemplateAttribution(form)).toEqual({ systemTemplateBundleId: null, systemTemplateVariantId: null });
});
