import { describe, expect, it } from "vitest";
import {
  canReuseIosServerAsset,
  canUseServerAssetReference,
  getIosCssValues,
  getIosImageDrawPlan,
  getIosSlotExportTargets,
} from "@/lib/theme/ios/export";
import { flipBubbleGeometryHorizontally } from "@/lib/theme/bubbleGeometry";
import { iosThemeSlots } from "@/lib/theme/templates";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

/**
 * iOS 내보내기 계약.
 *
 * 파일 경로·배율·CSS 값·서버 에셋 우회 조건처럼 **캔버스 없이 계산되는 부분**만 다룬다.
 * 내보낸 이미지의 실제 픽셀은 happy-dom에 2D 컨텍스트가 없어 여기서 확인할 수 없다.
 * 픽셀 검증은 Playwright 몫이다(`e2e/AGENTS.md`).
 */

const imageSlots = iosThemeSlots.filter((slot) => slot.kind !== "color" && Boolean(slot.path));

function findSlot(id: string): ThemeAssetSlot {
  const slot = iosThemeSlots.find((candidate) => candidate.id === id);
  if (!slot) throw new Error(`슬롯을 찾지 못했습니다: ${id}`);
  return slot;
}

describe("iOS bubble export defaults", () => {
  it("저장된 geometry가 없어도 가운데 기본값을 source scale에 맞춰 출력한다", () => {
    expect(
      getIosCssValues(
        undefined,
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
        { width: 360, height: 180 },
      ),
    ).toEqual({
      stretch: "60px 30px",
      insets: "15px 30px 15px 30px",
    });
  });

  it("저장된 geometry는 source scale로 나눠 포인트 값으로 바꾼다", () => {
    // CSS는 포인트 단위이고 편집 좌표는 원본 픽셀 단위다. @3x 원본이면 3으로 나눠야 실제
    // 기기에서 편집 화면과 같은 위치에 텍스트 상자가 놓인다.
    expect(
      getIosCssValues(
        { geometry: { stretch: { x: 60, y: 30 }, contentInsets: { top: 30, right: 45, bottom: 15, left: 24 } } },
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
      ),
    ).toEqual({
      // edgeinsets 순서는 top / left / bottom / right 다. 이 순서가 바뀌면 좌우 여백이 뒤집힌다.
      stretch: "20px 10px",
      insets: "10px 8px 5px 15px",
    });
  });

  it("geometry가 없으면 legacy insets/stretch를 쓴다", () => {
    expect(
      getIosCssValues(
        { insets: { top: 30, right: 45, bottom: 15, left: 24 }, stretch: { x: 60, y: 30 } },
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
      ),
    ).toEqual({
      stretch: "20px 10px",
      insets: "10px 8px 5px 15px",
    });
  });

  it("flipX면 cap inset의 좌우를 바꾸고 stretch를 폭 기준으로 반사한다", () => {
    // 이미지 픽셀을 뒤집으므로 CSS도 같은 좌표계에서 한 번 뒤집혀야 한다. 한쪽만 뒤집으면
    // 늘어나는 위치와 글자 여백이 반대편에 남는다.
    expect(
      getIosCssValues(
        {
          geometry: { stretch: { x: 60, y: 30 }, contentInsets: { top: 30, right: 45, bottom: 15, left: 24 } },
          flipX: true,
        },
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
        { width: 300, height: 150 },
      ),
    ).toEqual({
      // stretch.x = (300 - 1) - 60 = 239 → 239/3 ≈ 80
      stretch: "80px 10px",
      // left ↔ right 만 바뀐다. top/bottom은 그대로.
      insets: "10px 15px 5px 8px",
    });
  });

  it("두 번 뒤집으면 원래 CSS 값으로 돌아온다", () => {
    const edit = { geometry: { stretch: { x: 60, y: 30 }, contentInsets: { top: 30, right: 45, bottom: 15, left: 24 } } };
    const args = [{ top: 10, right: 17, bottom: 7, left: 11 }, { x: 17, y: 17 }, 3, { width: 300, height: 150 }] as const;
    const once = getIosCssValues({ ...edit, flipX: true }, ...args);
    const twice = getIosCssValues(
      { geometry: flipBubbleGeometryHorizontally(edit.geometry, 300), flipX: true },
      ...args,
    );

    expect(twice).toEqual(getIosCssValues(edit, ...args));
    expect(once).not.toEqual(twice);
  });

  it("flipX여도 source 크기를 모르면 여백만 바꾸고 stretch는 두지 않는다", () => {
    // 폭 없이 stretch를 추정하면 값이 조용히 틀린다. 말풍선 슬롯은 항상 크기를 재므로
    // 실제로 이 경로를 타지 않지만, 규칙은 명시해 둔다.
    expect(
      getIosCssValues(
        { insets: { top: 30, right: 45, bottom: 15, left: 24 }, stretch: { x: 60, y: 30 }, flipX: true },
        { top: 10, right: 17, bottom: 7, left: 11 },
        { x: 17, y: 17 },
        3,
      ),
    ).toEqual({
      stretch: "20px 10px",
      insets: "10px 15px 5px 8px",
    });
  });

  it("편집값도 source 크기도 없으면 fallback을 배율로 나누지 않는다", () => {
    // fallback은 이미 포인트 단위로 적힌 값이다. 한 번 더 나누면 말풍선 여백이 1/3로 줄어든다.
    expect(
      getIosCssValues(undefined, { top: 10, right: 17, bottom: 7, left: 11 }, { x: 17, y: 17 }, 3),
    ).toEqual({
      stretch: "17px 17px",
      insets: "10px 11px 7px 17px",
    });
  });
});

describe("iOS 슬롯 출력 경로와 배율", () => {
  it("말풍선은 @2x와 @3x 두 파일로 나간다", () => {
    expect(getIosSlotExportTargets(findSlot("ios-bubble-me-1"))).toEqual([
      { path: "Images/chatroomBubbleSend01@2x.png", targetScale: 2 },
      { path: "Images/chatroomBubbleSend01@3x.png", targetScale: 3 },
    ]);
    expect(getIosSlotExportTargets(findSlot("ios-bubble-you-2"))).toEqual([
      { path: "Images/chatroomBubbleReceive02@2x.png", targetScale: 2 },
      { path: "Images/chatroomBubbleReceive02@3x.png", targetScale: 3 },
    ]);
  });

  it("선택 변형도 기본 말풍선과 같은 배율 target을 갖는다", () => {
    // 선택 변형은 공유·반전 범위 밖이지만 내보내기 대상이기는 하다.
    expect(getIosSlotExportTargets(findSlot("ios-bubble-me-1-selected")).map((target) => target.targetScale)).toEqual([2, 3]);
  });

  it("배경처럼 @3x만 필요한 슬롯은 한 파일로 나간다", () => {
    expect(getIosSlotExportTargets(findSlot("ios-main-background-image"))).toEqual([
      { path: "Images/mainBgImage@3x.png", targetScale: 3 },
    ]);
  });

  it("배율 target이 없는 슬롯은 매니페스트 경로 그대로 한 번만 나간다", () => {
    expect(getIosSlotExportTargets(findSlot("ios-common-theme-icon"))).toEqual([
      { path: "Images/commonIcoTheme.png" },
    ]);
  });

  it("path에 이미 @Nx가 붙어 있어도 접미사를 겹쳐 쓰지 않는다", () => {
    const slot = { ...findSlot("ios-bubble-me-1"), path: "Images/chatroomBubbleSend01@3x.png" };
    expect(getIosSlotExportTargets(slot).map((target) => target.path)).toEqual([
      "Images/chatroomBubbleSend01@2x.png",
      "Images/chatroomBubbleSend01@3x.png",
    ]);
  });

  it("서로 다른 슬롯이 같은 출력 경로를 차지하지 않는다", () => {
    const ownerByPath = new Map<string, string>();
    const collisions: string[] = [];
    for (const slot of imageSlots) {
      for (const { path } of getIosSlotExportTargets(slot)) {
        const owner = ownerByPath.get(path);
        if (owner) collisions.push(`${path}: ${owner} / ${slot.id}`);
        else ownerByPath.set(path, slot.id);
      }
    }

    expect(collisions).toEqual([]);
  });

  it("모든 이미지 슬롯이 최소 한 파일을 내보낸다", () => {
    const empty = imageSlots.filter((slot) => getIosSlotExportTargets(slot).length === 0);
    expect(empty.map((slot) => slot.id)).toEqual([]);
  });
});

describe("서버 에셋 우회 판정", () => {
  const bubble = findSlot("ios-bubble-me-1");

  it("로컬 템플릿 에셋만 우회 대상이다", () => {
    expect(canUseServerAssetReference(bubble, "/template-assets/bubble.png")).toBe(true);
    expect(canUseServerAssetReference(bubble, "https://cdn.test/bubble.png")).toBe(false);
  });

  it("Android 나인패치 원본은 marker border를 떼야 하므로 우회하지 않는다", () => {
    // 우회하면 1px marker border가 그대로 iOS 이미지에 남아 말풍선 가장자리에 검은 점선이 보인다.
    expect(canUseServerAssetReference(bubble, "/template-assets/bubble.9.png")).toBe(false);
  });

  it("PNG로 나가는 슬롯은 원본도 PNG일 때만 우회한다", () => {
    expect(canUseServerAssetReference(bubble, "/template-assets/bubble.webp")).toBe(false);
  });

  it("배율이 같을 때만 서버 에셋을 그대로 넘긴다", () => {
    expect(canReuseIosServerAsset(3, 3, true)).toBe(true);
    // 리사이즈가 필요하면 blob으로 실체화해야 한다.
    expect(canReuseIosServerAsset(2, 3, true)).toBe(false);
    // 배율 target이 없는 슬롯은 변환이 없으므로 항상 우회할 수 있다.
    expect(canReuseIosServerAsset(undefined, 3, true)).toBe(true);
  });

  it("서버 에셋이 없으면 배율이 같아도 blob 경로로 간다", () => {
    expect(canReuseIosServerAsset(3, 3, false)).toBe(false);
    expect(canReuseIosServerAsset(undefined, 3, false)).toBe(false);
  });
});

describe("iOS image source normalization", () => {
  it("Android .9.png source는 marker border를 제외한 영역만 그린다", () => {
    expect(getIosImageDrawPlan("bubble.9.png", 202, 102)).toEqual({
      outputWidth: 200,
      outputHeight: 100,
      sourceRect: { x: 1, y: 1, width: 200, height: 100 },
    });
  });

  it("signed URL의 .9.png도 판별하고 일반 PNG는 원본 크기를 유지한다", () => {
    expect(getIosImageDrawPlan("https://storage.test/bubble.9.png?token=secret", 92, 62)).toEqual({
      outputWidth: 90,
      outputHeight: 60,
      sourceRect: { x: 1, y: 1, width: 90, height: 60 },
    });
    expect(getIosImageDrawPlan("bubble.png", 90, 60)).toEqual({
      outputWidth: 90,
      outputHeight: 60,
      sourceRect: undefined,
    });
  });
});
