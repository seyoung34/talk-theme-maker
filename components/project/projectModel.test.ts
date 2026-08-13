import { describe, expect, it } from "vitest";
import { buildSlotCandidates, getDerivedColorLink, isRemovableUploadCandidate } from "@/components/project/projectModel";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssets";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

describe("isRemovableUploadCandidate", () => {
  it("직접 소유한 사용자 업로드와 hydrate된 템플릿 업로드는 삭제할 수 있다", () => {
    expect(isRemovableUploadCandidate({ source: "upload" })).toBe(true);
    expect(isRemovableUploadCandidate({ source: "template" })).toBe(true);
  });

  it("상속된 업로드 후보는 원본 슬롯 소유이므로 삭제할 수 없다", () => {
    expect(isRemovableUploadCandidate({ source: "template", inherited: true })).toBe(false);
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
    expect(isRemovableUploadCandidate(matching[0])).toBe(true);
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

  it("파생 규칙이 없는 슬롯에는 카드를 띄우지 않는다", () => {
    expect(getDerivedColorLink(chatBackground, {}, iosSelections, "basic", template, iosSlots)).toBeUndefined();
  });

  it("연동 중이면 기준 슬롯과 적용될 색을 알려 준다", () => {
    const result = link({ [chatBackground.id]: "#111111" })!;
    expect(result.linked).toBe(true);
    expect(result.baseLabel).toBe(chatBackground.label);
    expect(result.color).toBe("#887F33");
  });

  /**
   * 끊긴 상태에서도 "되돌리면 이 색이 된다"를 보여 줘야 버튼이 무엇을 하는지 알 수 있다.
   * 직접 지정을 뺀 상태로 다시 해석하므로, 되돌리기 동작과 같은 값이 나온다.
   */
  it("직접 지정 중이어도 되돌렸을 때의 색을 계산해 준다", () => {
    const result = link({ [chatBackground.id]: "#111111", [unread.id]: "#FF0000" })!;
    expect(result.linked).toBe(false);
    expect(result.color).toBe("#887F33");
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
