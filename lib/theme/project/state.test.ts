import { describe, expect, it } from "vitest";
import { getBubblePairRole, getImageAssetFallbackRole, getInheritedSourceSlot, getInitialSlotCandidateSelections, getResolvedAssetUrl, getSlotCandidates, type SlotUploads } from "@/lib/theme/project/state";
import { createThemeProjectAnalysis } from "@/lib/theme/project/diagnostics";
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

describe("basic Android bubble asset separation", () => {
  const template = themeTemplates[0];
  const slots = getThemeSlots("android");
  const bubbleRoles = ["bubble_me_1", "bubble_me_2", "bubble_you_1", "bubble_you_2"] as const;

  it("candidate는 일반 PNG를 보여주고 resolved asset은 9-patch를 유지한다", () => {
    const selections = getInitialSlotCandidateSelections(slots, template.id, template);

    for (const role of bubbleRoles) {
      const slot = slots.find((candidate) => candidate.role === role)!;
      const candidate = getSlotCandidates(slot, template.id, template).find((item) => item.isDefault)!;

      expect(candidate.assetUrl).toMatch(/\.9\.png$/);
      expect(candidate.previewUrl).toMatch(/(?<!\.9)\.png$/);
      expect(getResolvedAssetUrl(slot, {}, selections, template.id, template, slots)).toBe(candidate.assetUrl);
    }
  });

  it("편집기 분석에도 export 원본과 별도의 프리뷰 URL을 전달한다", () => {
    const selections = getInitialSlotCandidateSelections(slots, template.id, template);
    const analysis = createThemeProjectAnalysis(template, "android", slots, {}, {}, selections);
    const me1 = analysis.files.find((file) => file.name === "theme_chatroom_bubble_me_01_image.9.png");

    expect(me1?.sourceUrl).toBe("/template-assets/basic/android/theme_chatroom_bubble_me_01_image.9.png");
    expect(me1?.previewUrl).toBe("/template-assets/basic/android/theme_chatroom_bubble_me_01_image.png");
    expect(me1?.previewName).toBe("theme_chatroom_bubble_me_01_image.png");
  });

  it("peer 슬롯이 소유한 공유 업로드를 편집기 분석 파일로 전달한다", () => {
    const me1Slot = slots.find((slot) => slot.role === "bubble_me_1")!;
    const me2Slot = slots.find((slot) => slot.role === "bubble_me_2")!;
    const sharedFile = new File(["shared"], "shared-bubble.png", { type: "image/png" });
    const selections = {
      ...getInitialSlotCandidateSelections(slots, template.id, template),
      [me1Slot.id]: "shared-upload",
    };
    const analysis = createThemeProjectAnalysis(
      template,
      "android",
      slots,
      { [me2Slot.id]: [{ id: "shared-upload", file: sharedFile }] },
      {},
      selections,
    );
    const me1 = analysis.files.find((file) => file.name === me1Slot.fileName);

    expect(me1?.file).toBe(sharedFile);
    expect(me1?.sourceUrl).toBeUndefined();
    expect(analysis.diagnostics).not.toContainEqual(expect.objectContaining({ code: "missing-asset", slotId: me1Slot.id }));
  });

  it("catalog-only 업로드는 preview URL을 분석에도 전달하고 missing 진단을 만들지 않는다", () => {
    const mainSlot = slots.find((slot) => slot.role === "main_background")!;
    const selections = { ...getInitialSlotCandidateSelections(slots, template.id, template), [mainSlot.id]: "catalog-upload" };
    const uploads: SlotUploads = {
      [mainSlot.id]: [{
        id: "catalog-upload",
        catalog: {
          selection: { kind: "catalog", assetId: "admin:asset-a", revision: 1, variantKey: "canonical" },
          fileName: "main@3x.png",
          mimeType: "image/png",
          size: 1024,
          sourceScale: 3,
          width: 1125,
          height: 2436,
          pngSignatureVerified: true,
          previewUrl: "https://cdn.example.com/main.webp",
        },
      }],
    };

    const analysis = createThemeProjectAnalysis(template, "android", slots, uploads, {}, selections);
    const main = analysis.files.find((file) => file.path === mainSlot.path);

    expect(main?.file).toBeUndefined();
    expect(main?.previewUrl).toBe("https://cdn.example.com/main.webp");
    expect(analysis.diagnostics).not.toContainEqual(expect.objectContaining({ code: "missing-asset", slotId: mainSlot.id }));
  });
});
