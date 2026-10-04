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
