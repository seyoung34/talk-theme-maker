import { describe, expect, it } from "vitest";
import { createSystemTemplatePreviewVisual, getCorePreviewImageUrls, type TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";
import type { SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

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

describe("createSystemTemplatePreviewVisual", () => {
  it("peer 슬롯이 소유한 공유 업로드 ref를 말풍선 미리보기에 사용한다", () => {
    const template = getThemeTemplate("basic");
    const slots = getThemeSlots("android");
    const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
    const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;
    const storagePath = "system-templates/shared-bubble.png";
    const summary: SystemTemplateSummary = {
      id: "template-id",
      title: "공유 말풍선",
      baseTemplateId: "basic",
      platform: "android",
      status: "published",
      visibility: "public",
      pricingType: "free",
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      uploadCount: 1,
      colorCount: 0,
      colors: {},
      candidateSelections: { [me1.id]: "shared-upload" },
      uploadRefs: {
        [me2.id]: [{ id: "shared-upload", fileName: "bubble.png", mimeType: "image/png", size: 1, storagePath }],
      },
      previewMetadata: {},
    };

    const result = createSystemTemplatePreviewVisual({
      template,
      platform: "android",
      summary,
      signedUrls: { [storagePath]: "https://example.com/shared-bubble.png" },
    });

    expect(result.myBubbleImage).toBe("https://example.com/shared-bubble.png");
  });
});
