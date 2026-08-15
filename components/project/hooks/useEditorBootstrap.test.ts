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

  it("선택 정보가 없는 옛 레코드는 프리뷰 슬롯 자신의 첫 bucket을 유지한다", () => {
    const slots = getThemeSlots("android");
    const chat = slots.find((slot) => slot.role === "chat_background")!;
    const refs: RemoteSlotUploads = { [chat.id]: [ref("legacy-chat")] };

    expect(getInitialPreviewSlotIds("android", refs, {})).toEqual([chat.id]);
  });
});
