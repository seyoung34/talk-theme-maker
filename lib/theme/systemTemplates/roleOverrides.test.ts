import { describe, expect, it } from "vitest";
import { convertSystemTemplateOverridesByRole } from "@/lib/theme/systemTemplates/roleOverrides";
import type { ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

describe("convertSystemTemplateOverridesByRole", () => {
  it("교차 플랫폼 변환에서 source File 이름을 보존해 export adapter가 형식을 판정할 수 있게 한다", () => {
    const sourceSlots = getThemeSlots("android");
    const targetSlots = getThemeSlots("ios");
    const sourceSlot = sourceSlots.find((slot) => slot.role === "bubble_me_1")!;
    const targetSlot = targetSlots.find((slot) => slot.role === "bubble_me_1")!;
    const file = new File(["nine-patch"], "android-bubble.9.png", { type: "image/png" });
    const upload = { id: "bubble-upload", file, source: "template" as const };
    const sourceOverrides: ThemeEditOverrides = {
      colors: {},
      uploads: { [sourceSlot.id]: [upload] },
      candidateSelections: { [sourceSlot.id]: upload.id },
      bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, designs: {} },
    };

    const result = convertSystemTemplateOverridesByRole({
      sourceOverrides,
      sourceSlots,
      targetSlots,
      templateId: "basic",
      template: getThemeTemplate("basic"),
    });

    expect(result.uploads[targetSlot.id]?.[0]?.file).toBe(file);
    expect(result.uploads[targetSlot.id]?.[0]?.file.name).toBe("android-bubble.9.png");
    expect(result.candidateSelections[targetSlot.id]).toBe(upload.id);
  });

  it("좌우반전을 플랫폼별 slot id로 다시 매핑한다", () => {
    // bubbleFlipX는 role이 아니라 slot id를 키로 쓴다. 여기서 다시 매핑하지 않으면 플랫폼을
    // 바꿀 때 geometry는 따라오는데 반전만 조용히 사라진다.
    const sourceSlots = getThemeSlots("android");
    const targetSlots = getThemeSlots("ios");
    const sourceSlot = sourceSlots.find((slot) => slot.role === "bubble_you_2")!;
    const targetSlot = targetSlots.find((slot) => slot.role === "bubble_you_2")!;
    const sourceOverrides: ThemeEditOverrides = {
      colors: {},
      uploads: {},
      candidateSelections: {},
      bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, flipX: { [sourceSlot.id]: true }, designs: {} },
    };

    const result = convertSystemTemplateOverridesByRole({
      sourceOverrides,
      sourceSlots,
      targetSlots,
      templateId: "basic",
      template: getThemeTemplate("basic"),
    });

    expect(sourceSlot.id).not.toBe(targetSlot.id);
    expect(result.bubbleEdits.flipX?.[targetSlot.id]).toBe(true);
    expect(result.bubbleEdits.flipX?.[sourceSlot.id]).toBeUndefined();
  });

  it("flipX 필드가 없는 예전 overrides도 그대로 변환한다", () => {
    const sourceSlots = getThemeSlots("android");
    const sourceOverrides: ThemeEditOverrides = {
      colors: {},
      uploads: {},
      candidateSelections: {},
      bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, designs: {} },
    };

    const result = convertSystemTemplateOverridesByRole({
      sourceOverrides,
      sourceSlots,
      targetSlots: getThemeSlots("ios"),
      templateId: "basic",
      template: getThemeTemplate("basic"),
    });

    expect(result.bubbleEdits.flipX).toEqual({});
  });
});
