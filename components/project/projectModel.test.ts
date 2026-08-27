import { describe, expect, it } from "vitest";
import { buildSlotCandidates, getCandidateAccessibleName, getDerivedColorLink, isRemovableUploadCandidate } from "@/components/project/projectModel";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { themeColorContrast } from "@/lib/theme/color";
import { applyDerivedColorTransform } from "@/lib/theme/project/colorInheritance";
import { getDefaultColor, getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

describe("isRemovableUploadCandidate", () => {
  it("직접 소유한 사용자 업로드는 삭제할 수 있다", () => {
    expect(isRemovableUploadCandidate({ source: "upload" })).toBe(true);
  });

  it("템플릿 에셋은 관리자 편집에서만 삭제할 수 있다", () => {
    expect(isRemovableUploadCandidate({ source: "template" })).toBe(false);
    expect(isRemovableUploadCandidate({ source: "template" }, { allowTemplateAssetRemoval: true })).toBe(true);
  });

  it("상속된 업로드 후보는 원본 슬롯 소유이므로 삭제할 수 없다", () => {
    expect(isRemovableUploadCandidate({ source: "template", inherited: true })).toBe(false);
    expect(isRemovableUploadCandidate({ source: "template", inherited: true }, { allowTemplateAssetRemoval: true })).toBe(false);
    expect(isRemovableUploadCandidate({ source: "upload", inherited: true })).toBe(false);
  });

  it("기본 후보와 관리자 후보에는 삭제를 노출하지 않는다", () => {
    expect(isRemovableUploadCandidate({ source: "default" })).toBe(false);
    expect(isRemovableUploadCandidate({ source: "admin" })).toBe(false);
  });

  /**
   * `inherited` 표시는 **선택된 항목에만** 붙는다. 파생 슬롯이 기본 슬롯의 업로드를 읽어 올 때
   * 선택되지 않은 항목은 이 플래그가 없으므로, 종류만으로 삭제 가능 여부를 판단하면 "눌러도
   * 아무 일도 안 하는 버튼"이 남는다. 그래서 패널은 삭제 핸들러와 같은 기준(`ownerSlotId`가
   * 이 슬롯의 공유 풀 안인지)을 함께 본다.
   */
  it("파생 슬롯이 읽어 온 항목 중 선택되지 않은 것에는 상속 표시가 붙지 않는다", () => {
    const slots = getThemeSlots("android");
    const base = slots.find((slot) => slot.role === "tab_icon_chats")!;
    const derived = slots.find((slot) => slot.role === "tab_icon_chats_focused")!;
    const uploads = {
      [base.id]: [
        { id: "selected", file: new File(["a"], "a.png"), source: "user" as const },
        { id: "other", file: new File(["b"], "b.png"), source: "user" as const },
      ],
    };

    const candidates = buildSlotCandidates(derived, uploads, {}, { [base.id]: "selected" }, "basic", getThemeTemplate("basic"), slots)
      .filter((candidate) => candidate.source === "upload");

    expect(candidates.find((candidate) => candidate.id === "selected")?.inherited).toBe(true);
    expect(candidates.find((candidate) => candidate.id === "other")?.inherited).toBeUndefined();
    // 둘 다 owner는 기본 슬롯이다. 파생 슬롯의 bucket에는 아무것도 없다.
    expect(candidates.every((candidate) => candidate.ownerSlotId === base.id)).toBe(true);
    expect(uploads[derived.id]).toBeUndefined();
  });
});

/**
 * 색상 슬롯의 실제 값은 색 하나뿐인데 그 색을 나타내는 후보는 여럿이다 — 기본값 카드와 팔레트
 * 스와치가 같은 색을 가리킬 수 있다. 그래서 선택 표시를 후보 id로 판정하면 두 가지가 동시에
 * 어긋난다. 배경에서 자동 계산된 색을 쓰는 동안에도 기본값에 파란 링이 붙고, 정작 지금 색과
 * 같은 팔레트 스와치에는 아무 표시가 없다.
 */
describe("색상 후보 선택 표시", () => {
  const slots = getThemeSlots("android");
  const template = getThemeTemplate("basic");
  const chatBackground = slots.find((slot) => slot.role === "chat_background_color")!;
  const selections = getInitialSlotCandidateSelections(slots, "basic", template);

  const build = (colors: Record<string, string | undefined>) =>
    buildSlotCandidates(chatBackground, {}, colors, selections, "basic", template, slots);

  it("기본값과 다른 색을 쓰는 동안에는 기본값에 표시가 붙지 않는다", () => {
    const base = build({ [chatBackground.id]: "#123456" }).find((candidate) => candidate.source === "default")!;

    expect(base.colorValue!.toUpperCase()).not.toBe("#123456");
    expect(base.selected).toBe(false);
  });

  it("기본값과 같은 색이면 기본값에 표시가 붙는다", () => {
    const defaultColor = getDefaultColor(chatBackground, "basic", template)!;
    const base = build({ [chatBackground.id]: defaultColor }).find((candidate) => candidate.source === "default")!;

    expect(base.selected).toBe(true);
  });

  it("지금 색과 같은 팔레트 스와치에 표시가 붙는다", () => {
    // 팔레트는 테마에서 쓰이는 색을 모은다. 다른 슬롯이 쓰는 색을 이 슬롯에도 넣으면 스와치가 생긴다.
    const title = slots.find((slot) => slot.role === "main_title_color")!;
    const shared = getDefaultColor(title, "basic", template)!;
    const palette = build({ [chatBackground.id]: shared }).filter((candidate) => candidate.source === "palette");

    const match = palette.find((candidate) => candidate.colorValue!.toUpperCase() === shared.toUpperCase());
    expect(match?.selected).toBe(true);
    expect(palette.filter((candidate) => candidate.selected)).toHaveLength(1);
  });

  it("이미지 슬롯은 그대로 선택 id로 판정한다", () => {
    // 이미지 슬롯은 후보마다 실제 파일이 달라서 id 비교가 맞다. 색상 규칙이 새면 안 된다.
    const bubble = slots.find((slot) => slot.role === "bubble_me_1")!;
    const uploads = { [bubble.id]: [{ id: "u1", file: new File(["a"], "a.png"), source: "user" as const }] };
    const candidates = buildSlotCandidates(bubble, uploads, {}, { [bubble.id]: "u1" }, "basic", template, slots);

    expect(candidates.find((candidate) => candidate.id === "u1")?.selected).toBe(true);
    expect(candidates.find((candidate) => candidate.source === "default")?.selected).toBe(false);
  });
});

describe("시스템 템플릿과 추천 에셋 후보 병합", () => {
  const slots = getThemeSlots("android");
  const slot = slots.find((candidate) => candidate.role === "bubble_you_1")!;
  const template = getThemeTemplate("basic");

  function adminAsset(id: string, title = "메론소다"): AdminAssetCandidate {
    return {
      id,
      slotRole: slot.role,
      platform: "android",
      assetKind: "bubble",
      title,
      tags: [],
      fileName: "melon-soda.png",
      mimeType: "image/png",
      storagePath: `admin-assets/${id}/melon-soda.png`,
      createdAt: 1,
      updatedAt: 1,
      enabled: true,
    };
  }

  it("동일 ID는 템플릿 소유권을 유지한 후보 하나로 보여 준다", () => {
    const id = "shared-melon-soda";
    const uploads = {
      [slot.id]: [{ id, file: new File(["template-copy"], "template-copy.png"), source: "template" as const }],
    };

    const candidates = buildSlotCandidates(
      slot,
      uploads,
      {},
      { [slot.id]: id },
      "basic",
      template,
      slots,
      [adminAsset(id)],
      { [id]: "blob:template-preview" },
    );
    const matching = candidates.filter((candidate) => candidate.id === id);

    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({
      id,
      title: "메론소다",
      status: "템플릿 포함 · 말풍선",
      source: "template",
      ownerSlotId: slot.id,
      previewUrl: "blob:template-preview",
      selected: true,
    });
    expect(isRemovableUploadCandidate(matching[0], { allowTemplateAssetRemoval: true })).toBe(true);
  });

  it("ID가 다른 추천 에셋은 별도 후보로 유지한다", () => {
    const templateId = "template-only";
    const recommendedId = "recommended-only";
    const candidates = buildSlotCandidates(
      slot,
      { [slot.id]: [{ id: templateId, file: new File(["template"], "template.png"), source: "template" as const }] },
      {},
      { [slot.id]: templateId },
      "basic",
      template,
      slots,
      [adminAsset(recommendedId, "다른 추천 에셋")],
    );

    expect(candidates.find((candidate) => candidate.id === templateId)).toMatchObject({
      title: "템플릿 에셋",
      source: "template",
      selected: true,
    });
    expect(candidates.find((candidate) => candidate.id === recommendedId)).toMatchObject({
      title: "다른 추천 에셋",
      source: "admin",
      selected: false,
    });
  });

  it("추천 목록에 없어도 템플릿 에셋은 그대로 유지한다", () => {
    const id = "private-template-asset";
    const candidates = buildSlotCandidates(
      slot,
      { [slot.id]: [{ id, file: new File(["template"], "private.png"), source: "template" as const }] },
      {},
      { [slot.id]: id },
      "basic",
      template,
      slots,
    );

    expect(candidates.filter((candidate) => candidate.id === id)).toEqual([
      expect.objectContaining({ title: "템플릿 에셋", status: "private.png", source: "template", selected: true }),
    ]);
  });

  /**
   * 추천 API가 슬롯에 맞춰 이미 골라 준 목록이다. 여기서 한 번 더 거르면 서버가 24개씩 잘라 낸
   * **뒤에** 줄어들어 `/admin/assets`와 개수가 맞지 않고, 판정이 export 게이트와도 갈라진다.
   *
   * `find_add_friend`·`splash`·`passcode_keypad_pressed_image`는 예전 클라이언트 필터의 role
   * 화이트리스트에 없어서 추천 에셋이 **항상 0개**로 보이던 슬롯이다.
   */
  it.each(["find_add_friend", "splash", "profile_image_2", "tab_icon_chats"])(
    "%s 슬롯도 추천 응답을 그대로 후보로 보여 준다",
    (role) => {
      const target = slots.find((candidate) => candidate.role === role)!;
      const recommended = {
        ...adminAsset("server-picked", "서버가 고른 추천"),
        slotRole: "theme_icon" as const,
        assetKind: "icon" as const,
        // 불투명 가로형: 예전 shape 게이트가 tab_icon_* 슬롯에서 버리던 형태다.
        analysis: { shapes: ["wide" as const] },
      };

      const candidates = buildSlotCandidates(target, {}, {}, {}, "basic", template, slots, [recommended]);

      expect(candidates.filter((candidate) => candidate.source === "admin")).toHaveLength(1);
    },
  );

  it("추천 응답 개수를 그대로 후보 개수로 옮긴다", () => {
    const recommended = Array.from({ length: 24 }, (_, index) => adminAsset(`asset-${index}`));

    const candidates = buildSlotCandidates(slot, {}, {}, {}, "basic", template, slots, recommended);

    expect(candidates.filter((candidate) => candidate.source === "admin")).toHaveLength(24);
  });
});

/**
 * 팔레트는 테마에서 쓰이는 색을 모아 보여 준다. 그래서 읽지 않음 숫자를 편집할 때 채팅방
 * 배경색이 스와치로 떴고, 실제 사용자가 그걸 눌러 글자가 배경에 완전히 묻혔다.
 * 그 시점에 직접 지정이 기록되면서 배경 연동까지 함께 꺼졌다.
 */
describe("대비 보정 슬롯의 팔레트", () => {
  const slots = getThemeSlots("ios");
  const template = getThemeTemplate("basic");
  const selections = getInitialSlotCandidateSelections(slots, "basic", template);
  const unread = slots.find((slot) => slot.role === "chat_unread_count_color")!;
  const chatBackground = slots.find((slot) => slot.role === "chat_background_color")!;
  const mainTitle = slots.find((slot) => slot.role === "main_title_color")!;

  function paletteColors(slot: typeof unread, colors: Record<string, string | undefined>) {
    return buildSlotCandidates(slot, {}, colors, selections, "basic", template, slots)
      .filter((candidate) => candidate.source === "palette" && candidate.colorValue)
      .map((candidate) => candidate.colorValue!.toUpperCase());
  }

  it("자기가 깔고 앉은 배경색은 후보에 넣지 않는다", () => {
    expect(paletteColors(unread, { [chatBackground.id]: "#1F2937" })).not.toContain("#1F2937");
  });

  it("다른 색은 그대로 고를 수 있다", () => {
    expect(paletteColors(unread, { [chatBackground.id]: "#1F2937", [mainTitle.id]: "#ABCDEF" })).toContain("#ABCDEF");
  });

  it("대비 보정 슬롯이 아니면 배경색도 후보로 남는다", () => {
    // 일반 색상 슬롯에서는 배경색을 고르는 게 이상하지 않다. 이 제외는 읽히는 것이 목적인
    // 슬롯에만 적용한다.
    expect(paletteColors(mainTitle, { [chatBackground.id]: "#1F2937" })).toContain("#1F2937");
  });
});

/**
 * 기준 슬롯 연동 상태.
 *
 * 예전에는 팔레트 후보 칩("배경에 맞춰 자동")으로 노출했는데, 배경 파생 슬롯이 쓰는 "역할별
 * 자동 맞춤" 카드와 생김새가 달라 같은 개념으로 읽히지 않았다. 이제 두 패널이 이 값을 받아
 * 자동 맞춤과 같은 UI로 그린다.
 */
describe("getDerivedColorLink", () => {
  const iosSlots = getThemeSlots("ios");
  const template = getThemeTemplate("basic");
  const iosSelections = getInitialSlotCandidateSelections(iosSlots, "basic", template);
  const unread = iosSlots.find((slot) => slot.role === "chat_unread_count_color")!;
  const chatBackground = iosSlots.find((slot) => slot.role === "chat_background_color")!;
  const bubbleMe = iosSlots.find((slot) => slot.role === "chat_bubble_me_color")!;

  const link = (colors: Record<string, string | undefined>) =>
    getDerivedColorLink(unread, colors, iosSelections, "basic", template, iosSlots);

  /**
   * 값을 적어 두지 않고 변환 함수로 구한다.
   *
   * 읽지 않음 숫자는 슬롯 기본색(= 템플릿 accent)을 기준 배경에서 읽히도록 보정한 값이다.
   * 결과를 리터럴로 박아 두면 템플릿 기본색을 바꿀 때마다 이 테스트가 무관하게 깨진다.
   * 여기서 확인할 것은 "getDerivedColorLink가 파생색을 그대로 넘겨주는가"이지 보정 산식이 아니다.
   */
  const derivedOn = (base: string) =>
    applyDerivedColorTransform(base, "contrast-on-base", getDefaultColor(unread, "basic", template));

  it("파생 규칙이 없는 슬롯에는 카드를 띄우지 않는다", () => {
    expect(getDerivedColorLink(chatBackground, {}, iosSelections, "basic", template, iosSlots)).toBeUndefined();
  });

  it("연동 중이면 기준 슬롯과 적용될 색을 알려 준다", () => {
    const result = link({ [chatBackground.id]: "#111111" })!;
    expect(result.linked).toBe(true);
    expect(result.baseLabel).toBe(chatBackground.label);
    expect(result.color).toBe(derivedOn("#111111"));
    // 기본 강조색이 어두운 배경에서 그대로 나오면 보정이 돌지 않은 것이다.
    expect(themeColorContrast(result.color!, "#111111")).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * 끊긴 상태에서도 "되돌리면 이 색이 된다"를 보여 줘야 버튼이 무엇을 하는지 알 수 있다.
   * 직접 지정을 뺀 상태로 다시 해석하므로, 되돌리기 동작과 같은 값이 나온다.
   */
  it("직접 지정 중이어도 되돌렸을 때의 색을 계산해 준다", () => {
    const result = link({ [chatBackground.id]: "#111111", [unread.id]: "#FF0000" })!;
    expect(result.linked).toBe(false);
    expect(result.color).toBe(derivedOn("#111111"));
  });

  it("대비 보정형과 그대로 따라가는 형은 설명이 다르다", () => {
    const contrastFit = link({})!;
    const follow = getDerivedColorLink(
      iosSlots.find((slot) => slot.role === "chat_bubble_me_selected_color")!,
      {}, iosSelections, "basic", template, iosSlots,
    )!;
    expect(contrastFit.description).toContain("읽히도록");
    expect(follow.baseLabel).toBe(bubbleMe.label);
    expect(follow.description).not.toContain("읽히도록");
  });

  it("연동 복귀 후보를 팔레트 칩으로는 더 이상 내보내지 않는다", () => {
    const candidates = buildSlotCandidates(unread, {}, { [chatBackground.id]: "#111111" }, iosSelections, "basic", template, iosSlots);
    expect(candidates.every((candidate) => candidate.colorValue)).toBe(true);
  });
});

/**
 * 다른 슬롯에서 올린 후보 표시.
 *
 * 같은 종류의 슬롯끼리 업로드를 공유하므로 후보 목록에는 여기서 올리지 않은 항목이 섞인다.
 * 어디서 온 것인지 모르면 지울 때 놀란다. 카드가 88~96px라 화면에 적을 자리가 없어
 * 접근성 이름과 툴팁으로 알린다.
 */
describe("다른 슬롯에서 온 후보", () => {
  const slots = getThemeSlots("android");
  const template = getThemeTemplate("basic");
  const me1 = slots.find((slot) => slot.role === "bubble_me_1")!;
  const me2 = slots.find((slot) => slot.role === "bubble_me_2")!;

  function candidatesFor(viewSlot: typeof me1, uploadOwnerSlotId: string) {
    const uploads = { [uploadOwnerSlotId]: [{ id: "shared-upload", file: new File(["x"], "x.png"), source: "user" as const }] };
    return buildSlotCandidates(viewSlot, uploads, {}, getInitialSlotCandidateSelections(slots, "basic", template), "basic", template, slots);
  }

  it("자기 bucket 업로드에는 원본 슬롯명을 붙이지 않는다", () => {
    const own = candidatesFor(me1, me1.id).find((candidate) => candidate.id === "shared-upload");
    expect(own?.ownerSlotLabel).toBeUndefined();
    expect(getCandidateAccessibleName(own!)).toBe("업로드 이미지");
  });

  it("다른 슬롯 bucket 업로드에는 그 슬롯 이름을 붙인다", () => {
    const shared = candidatesFor(me1, me2.id).find((candidate) => candidate.id === "shared-upload");
    expect(shared?.ownerSlotLabel).toBe(me2.label);
    expect(getCandidateAccessibleName(shared!)).toBe(`업로드 이미지 · ${me2.label}에서 추가`);
  });

  it("접근성 이름이 보이는 글자를 그대로 포함한다", () => {
    // 음성 제어는 보이는 글자로 지목한다. 카드에 보이는 것은 title뿐이다(WCAG 2.5.3).
    const shared = candidatesFor(me1, me2.id).find((candidate) => candidate.id === "shared-upload")!;
    expect(getCandidateAccessibleName(shared)).toContain(shared.title);
  });
});
