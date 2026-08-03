import { describe, expect, it } from "vitest";
import { buildSlotContrastWarnings, getSlotContrastWarning } from "@/components/project/slotContrast";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

/**
 * 읽지 않음 숫자는 채팅방 배경 위에 직접 그려진다. 배경과 거의 같은 색을 직접 지정하면
 * 글자가 묻히므로, 다른 4.5:1 대비 슬롯과 같은 기준으로 경고가 떠야 한다.
 */
describe("getSlotContrastWarning - chat_unread_count_color", () => {
  const platform = "ios";
  const slots = getThemeSlots(platform);
  const templateId = "basic";
  const template = getThemeTemplate(templateId);
  const selections = getInitialSlotCandidateSelections(slots, templateId, template);
  const unread = slots.find((slot) => slot.role === "chat_unread_count_color")!;
  const chatBackground = slots.find((slot) => slot.role === "chat_background_color")!;

  function context(colors: Record<string, string | undefined>) {
    return { platform, slots, colors, selections, templateId, template, imageColorPalette: null } as const;
  }

  it("배경과 글자색이 거의 같으면 4.5:1 기준으로 경고한다", () => {
    const colors = { [chatBackground.id]: "#1F2937", [unread.id]: "#20293A" };
    const warning = getSlotContrastWarning(unread, context(colors));
    expect(warning).not.toBeNull();
    expect(warning!.minimumRatio).toBe(4.5);
    expect(warning!.backgroundLabel).toBe("채팅방 배경");
  });

  it("충분히 대비되는 색에는 경고가 없다", () => {
    const colors = { [chatBackground.id]: "#1F2937", [unread.id]: "#FFFFFF" };
    expect(getSlotContrastWarning(unread, context(colors))).toBeNull();
  });

  it("buildSlotContrastWarnings에도 반영된다", () => {
    const colors = { [chatBackground.id]: "#1F2937", [unread.id]: "#20293A" };
    const warnings = buildSlotContrastWarnings(context(colors));
    expect(warnings[unread.id]).toBeDefined();
  });
});
