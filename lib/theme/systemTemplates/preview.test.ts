import { describe, expect, it } from "vitest";
import { getCorePreviewImageUrls, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";

function visual(overrides: Partial<TemplatePreviewVisual> = {}): TemplatePreviewVisual {
  return {
    platform: "android",
    chatBackgroundColor: "#ffffff",
    mainBackgroundColor: "#ffffff",
    tabBackgroundColor: "#ffffff",
    myBubbleTextColor: "#000000",
    friendBubbleTextColor: "#000000",
    myBubbleFillColor: "#facc15",
    friendBubbleFillColor: "#ffffff",
    mainHeaderColor: "#ffffff",
    mainHeaderForegroundColor: "#000000",
    bodyCellColor: "#ffffff",
    titleColor: "#000000",
    descriptionColor: "#000000",
    sectionTitleColor: "#000000",
    bodyCellBorderColor: "#eeeeee",
    unreadColor: "#ff0000",
    ...overrides,
  };
}

describe("getCorePreviewImageUrls", () => {
  it("배경 두 장과 말풍선 두 장을 기다린다", () => {
    const urls = getCorePreviewImageUrls(
      visual({
        mainBackgroundImage: "main.png",
        chatBackgroundImage: "chat.png",
        myBubbleImage: "me.png",
        friendBubbleImage: "you.png",
      }),
    );

    expect(urls).toEqual(["main.png", "chat.png", "me.png", "you.png"]);
  });

  // 탭 아이콘·프로필은 비어도 티가 작아 모달을 붙잡아 둘 이유가 없다.
  it("탭 아이콘과 프로필은 기다리지 않는다", () => {
    const urls = getCorePreviewImageUrls(
      visual({
        chatBackgroundImage: "chat.png",
        profileImage: "profile.png",
        profileImageFull: "profile-full.png",
        tabIcons: { friends: "friends.png", chatsFocused: "chats.png" },
      }),
    );

    expect(urls).toEqual(["chat.png"]);
  });

  it("색상만 쓰는 템플릿은 기다릴 이미지가 없다", () => {
    expect(getCorePreviewImageUrls(visual())).toEqual([]);
  });

  // 같은 이미지를 두 슬롯이 함께 쓰면 한 번만 받는다.
  it("같은 URL은 한 번만 돌려준다", () => {
    const urls = getCorePreviewImageUrls(visual({ myBubbleImage: "bubble.png", friendBubbleImage: "bubble.png" }));
    expect(urls).toEqual(["bubble.png"]);
  });
});
