import { describe, expect, it } from "vitest";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { resolveProjectImageSource, shouldUseDerivedAssetSource } from "@/lib/theme/project/assetSource";

describe("project image source resolution", () => {
  const template = getThemeTemplate("basic");
  const slots = getThemeSlots("android");
  const selections = getInitialSlotCandidateSelections(slots, template.id, template);
  const sourceSlot = slots.find((slot) => slot.role === "launcher_background")!;
  const derivedSlot = slots.find((slot) => slot.role === "launcher_icon")!;

  it("explicit launcher background를 호환 role의 preview source로 공유한다", () => {
    const file = new File(["launcher"], "launcher.png", { type: "image/png" });
    const uploads = { [sourceSlot.id]: [{ id: "launcher-upload", file }] };
    const nextSelections = { ...selections, [sourceSlot.id]: "launcher-upload" };

    expect(shouldUseDerivedAssetSource(derivedSlot, uploads, nextSelections, template.id, template, slots)).toBe(true);
    expect(resolveProjectImageSource(derivedSlot, uploads, nextSelections, template.id, template, slots)).toMatchObject({
      sourceSlot,
      selectedUpload: { id: "launcher-upload" },
      upload: file,
    });

    const analysis = createThemeProjectAnalysis(template, "android", slots, uploads, {}, nextSelections);
    expect(analysis.files.find((item) => item.path === derivedSlot.path)?.file).toBe(file);
  });

  it("launcher background가 기본값이면 role별 기본 artwork를 유지한다", () => {
    expect(shouldUseDerivedAssetSource(derivedSlot, {}, selections, template.id, template, slots)).toBe(false);
    const resolved = resolveProjectImageSource(derivedSlot, {}, selections, template.id, template, slots);
    expect(resolved.sourceSlot).toBe(derivedSlot);
    expect(resolved.sourceUrl).toBe("/template-assets/basic/android/launcher/ic_launcher.png");
  });
});
