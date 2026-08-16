import { describe, expect, it } from "vitest";
import { getInitialPreviewSlotIds } from "@/components/project/hooks/useEditorBootstrap";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { getThemeSlots } from "@/lib/theme/templates";

function ref(id: string) {
  return {
    id,
    fileName: `${id}.png`,
    mimeType: "image/png",
    size: 1,
    storagePath: `system-templates/${id}.png`,
  };
}

describe("getInitialPreviewSlotIds", () => {
  it("탭 아이콘은 선택된 공유 업로드의 owner bucket만 hydration한다", () => {
    const slots = getThemeSlots("android");
    const friends = slots.find((slot) => slot.role === "tab_icon_friends")!;
    const chats = slots.find((slot) => slot.role === "tab_icon_chats")!;
    const themeIcon = slots.find((slot) => slot.role === "theme_icon")!;
    const splash = slots.find((slot) => slot.role === "splash")!;
    const refs: RemoteSlotUploads = {
      [chats.id]: [ref("shared-tab")],
      [themeIcon.id]: [ref("unrelated-theme-icon")],
      [splash.id]: [ref("unrelated-splash")],
    };

    expect(getInitialPreviewSlotIds("android", refs, { [friends.id]: "shared-tab" })).toEqual([chats.id]);
  });

  it("배경도 선택된 owner만 받고 공유 그룹 전체 bucket을 받지 않는다", () => {
    const slots = getThemeSlots("android");
    const main = slots.find((slot) => slot.role === "main_background")!;
    const passcode = slots.find((slot) => slot.role === "passcode_background")!;
    const refs: RemoteSlotUploads = { [passcode.id]: [ref("shared-background")] };

    expect(getInitialPreviewSlotIds("android", refs, { [main.id]: "shared-background" })).toEqual([passcode.id]);
  });

  /**
   * 채팅방 프리뷰는 연속 메시지에 `bubble_*_2`를 쓴다. 이 역할이 초기 목록에서 빠지면 말풍선
   * 그룹을 눌러 on-demand hydration이 돌기 전까지 그 말풍선만 기본 이미지로 남는다.
   */
  it("연속 메시지 말풍선에 다른 업로드를 쓰면 그 bucket도 함께 받는다", () => {
    const slots = getThemeSlots("android");
    const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
    const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;
    const you1 = slots.find((slot) => slot.role === "bubble_you_1")!;
    const you2 = slots.find((slot) => slot.role === "bubble_you_2")!;
    const refs: RemoteSlotUploads = {
      [me1.id]: [ref("me-single")],
      [me2.id]: [ref("me-group")],
      [you1.id]: [ref("you-single")],
      [you2.id]: [ref("you-group")],
    };

    expect(getInitialPreviewSlotIds("android", refs, {})).toEqual([me1.id, you1.id, me2.id, you2.id]);
  });

  it("연속 메시지 말풍선이 같은 업로드를 공유하면 bucket이 늘지 않는다", () => {
    const slots = getThemeSlots("android");
    const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
    const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;
    const refs: RemoteSlotUploads = { [me1.id]: [ref("shared-bubble")] };

    expect(getInitialPreviewSlotIds("android", refs, { [me2.id]: "shared-bubble" })).toEqual([me1.id]);
  });

  it("선택 정보가 없는 옛 레코드는 프리뷰 슬롯 자신의 첫 bucket을 유지한다", () => {
    const slots = getThemeSlots("android");
    const chat = slots.find((slot) => slot.role === "chat_background")!;
    const refs: RemoteSlotUploads = { [chat.id]: [ref("legacy-chat")] };

    expect(getInitialPreviewSlotIds("android", refs, {})).toEqual([chat.id]);
  });
});
