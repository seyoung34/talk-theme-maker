import { describe, expect, it } from "vitest";
import { getBubblePairRole, getImageAssetFallbackRole, getInheritedSourceSlot, getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, themeTemplates } from "@/lib/theme/templates";

// getImageAssetFallbackRole은 별도 지정이 없는 이미지 슬롯이 어떤 슬롯을 상속하는지 정의하는 순수 함수다.
describe("getImageAssetFallbackRole", () => {
  it("풀사이즈 프로필은 기본 프로필 이미지를 상속한다", () => {
    expect(getImageAssetFallbackRole("profile_image_full_1")).toBe("profile_image_1");
    expect(getImageAssetFallbackRole("profile_image_full_2")).toBe("profile_image_2");
    expect(getImageAssetFallbackRole("profile_image_full_3")).toBe("profile_image_3");
  });

  it("탭 선택(focused) 아이콘은 같은 탭의 기본 아이콘을 상속한다", () => {
    expect(getImageAssetFallbackRole("tab_icon_friends_focused")).toBe("tab_icon_friends");
    expect(getImageAssetFallbackRole("tab_icon_chats_focused")).toBe("tab_icon_chats");
    expect(getImageAssetFallbackRole("tab_icon_now_focused")).toBe("tab_icon_now");
    expect(getImageAssetFallbackRole("tab_icon_shopping_focused")).toBe("tab_icon_shopping");
    expect(getImageAssetFallbackRole("tab_icon_more_focused")).toBe("tab_icon_more");
    expect(getImageAssetFallbackRole("tab_icon_call_focused")).toBe("tab_icon_call");
    expect(getImageAssetFallbackRole("tab_icon_piccoma_focused")).toBe("tab_icon_piccoma");
  });

  it("기본(default) 탭 아이콘 자체는 상속 대상이 없다", () => {
    expect(getImageAssetFallbackRole("tab_icon_friends")).toBeUndefined();
    expect(getImageAssetFallbackRole("tab_icon_more")).toBeUndefined();
  });

  it("상속 규칙이 없는 슬롯은 undefined를 반환한다", () => {
    expect(getImageAssetFallbackRole("main_background")).toBeUndefined();
    expect(getImageAssetFallbackRole("chat_background")).toBeUndefined();
  });
});

describe("getBubblePairRole", () => {
  it("pairs first and grouped bubbles only within the same side", () => {
    expect(getBubblePairRole("bubble_me_1")).toBe("bubble_me_2");
    expect(getBubblePairRole("bubble_me_2")).toBe("bubble_me_1");
    expect(getBubblePairRole("bubble_you_1")).toBe("bubble_you_2");
    expect(getBubblePairRole("bubble_you_2")).toBe("bubble_you_1");
    expect(getBubblePairRole("bubble_me_1_selected")).toBeUndefined();
  });
});

describe("getInheritedSourceSlot", () => {
  const template = themeTemplates[0];
  const slots = getThemeSlots("android");
  const focused = slots.find((slot) => slot.role === "tab_icon_friends_focused")!;
  const base = slots.find((slot) => slot.role === "tab_icon_friends")!;

  it("직접 선택이 없으면(기본 상태) 선택 아이콘은 기본 아이콘 슬롯을 상속한다", () => {
    const selections = getInitialSlotCandidateSelections(slots, template.id, template);
    const source = getInheritedSourceSlot(focused, {}, selections, template.id, template, slots);
    expect(source?.id).toBe(base.id);
  });

  it("선택 아이콘을 다른 candidate로 직접 지정하면 상속하지 않는다", () => {
    const selections = { ...getInitialSlotCandidateSelections(slots, template.id, template), [focused.id]: "some-other-candidate" };
    expect(getInheritedSourceSlot(focused, {}, selections, template.id, template, slots)).toBeUndefined();
  });

  it("상속 규칙이 없는 슬롯은 상속 대상이 없다", () => {
    const bg = slots.find((slot) => slot.role === "main_background")!;
    const selections = getInitialSlotCandidateSelections(slots, template.id, template);
    expect(getInheritedSourceSlot(bg, {}, selections, template.id, template, slots)).toBeUndefined();
  });
});
