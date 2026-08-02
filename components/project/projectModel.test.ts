import { describe, expect, it } from "vitest";
import { buildSlotCandidates, isRemovableUploadCandidate } from "@/components/project/projectModel";
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
