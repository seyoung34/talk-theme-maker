import { expect, it, vi } from "vitest";
vi.mock("@/lib/theme/android/export", () => ({ buildAndroidThemeExportFiles: async () => [] }));
vi.mock("@/lib/theme/ios/export", () => ({ buildIosThemeExportFiles: async () => [] }));
import { createExportFormData } from "./exportClient";
import type { ExportPayloadOptions } from "./exportModel";
const bundle = "abcdef01-2345-6789-abcd-ef0123456789";
const variant = "abcdef02-2345-6789-abcd-ef0123456789";
it.each(["apk", "ktheme"] as const)("%s includes system metadata outside the manifest and omits it for base/user templates", async (mode) => {
  const options = { mode, slots: [], exportName: "fixture", template: {}, analysis: {}, templateId: "basic", uploads: {}, colors: {}, selections: {}, bubbleGeometry: {}, bubbleMarkers: {}, bubbleInsets: {}, bubbleStretch: {}, bubbleFlipX: {} } as unknown as ExportPayloadOptions;
  const system = await createExportFormData({ ...options, systemTemplateBundleId: bundle, systemTemplateVariantId: variant });
  expect(system.get("systemTemplateBundleId")).toBe(bundle);
  expect(system.get("systemTemplateVariantId")).toBe(variant);
  expect(system.get("manifest")).toBe("[]");
  const base = await createExportFormData(options);
  expect(base.has("systemTemplateBundleId")).toBe(false);
  expect(base.has("systemTemplateVariantId")).toBe(false);
});

it.each(["apk", "ktheme"] as const)("%s sends the derived source only for My templates and never together with direct use", async (mode) => {
  const options = { mode, slots: [], exportName: "fixture", template: {}, analysis: {}, templateId: "basic", uploads: {}, colors: {}, selections: {}, bubbleGeometry: {}, bubbleMarkers: {}, bubbleInsets: {}, bubbleStretch: {}, bubbleFlipX: {} } as unknown as ExportPayloadOptions;
  const derived = await createExportFormData({ ...options, sourceSystemTemplateBundleId: bundle });
  expect(derived.get("sourceSystemTemplateBundleId")).toBe(bundle);
  expect(derived.has("systemTemplateBundleId")).toBe(false);
  expect(derived.get("manifest")).toBe("[]");
  const both = await createExportFormData({ ...options, systemTemplateBundleId: bundle, systemTemplateVariantId: variant, sourceSystemTemplateBundleId: variant });
  expect(both.get("systemTemplateBundleId")).toBe(bundle);
  expect(both.has("sourceSystemTemplateBundleId")).toBe(false);
  const invalid = await createExportFormData({ ...options, sourceSystemTemplateBundleId: "pastel-glass" });
  expect(invalid.has("sourceSystemTemplateBundleId")).toBe(false);
  expect((await createExportFormData(options)).has("sourceSystemTemplateBundleId")).toBe(false);
});
