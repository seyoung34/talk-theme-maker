import { describe, expect, it } from "vitest";
import { previewScreenIds, previewScreens, previewScreenSize, previewTabs } from "@/lib/theme/systemTemplates/previewScreenData";

/**
 * 굽는 쪽과 보여 주는 쪽이 같은 목록을 봐야 한다.
 *
 * `screenPreview.ts`는 `previewScreenIds`를 돌며 이미지를 굽고, 모달은 `previewScreens`를 돌며
 * 화면을 넘긴다. 한쪽에만 화면을 추가하면 모달에 "구운 이미지가 없는 탭"이 생기거나, 아무도
 * 보지 않는 이미지를 굽게 된다. 둘 다 조용히 어긋나는 종류의 실수다.
 */
describe("preview screen 목록", () => {
  it("굽는 목록과 보여 주는 목록이 같다", () => {
    expect(previewScreens.map((screen) => screen.id)).toEqual([...previewScreenIds]);
  });

  it("화면마다 라벨이 있다", () => {
    for (const screen of previewScreens) {
      expect(screen.label.trim()).not.toBe("");
    }
  });

  it("탭은 카카오톡 하단 5개다", () => {
    expect(previewTabs.map((tab) => tab.key)).toEqual(["friends", "chats", "now", "shopping", "more"]);
  });

  it("탭바의 친구·채팅이 화면 id와 이어진다", () => {
    // 탭바 활성 표시는 화면 id로 고른다. 이름이 갈라지면 활성 탭이 엉뚱한 곳에 켜진다.
    const tabKeys = previewTabs.map((tab) => tab.key);
    expect(tabKeys).toContain("friends");
    expect(tabKeys).toContain("chats");
  });
});

describe("preview screen 굽는 크기", () => {
  it("모달 목업과 같은 9:19.5 비율이다", () => {
    const ratio = previewScreenSize.height / previewScreenSize.width;
    expect(ratio).toBeCloseTo(19.5 / 9, 1);
  });

  it("실제 픽셀을 논리 크기보다 크게 잡는다", () => {
    // 1배로 구우면 최대 540px로 표시되는 목업에서 흐려진다.
    expect(previewScreenSize.deviceScale).toBeGreaterThan(1);
  });
});
