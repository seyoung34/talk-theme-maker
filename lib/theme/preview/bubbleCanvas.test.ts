import { describe, expect, it } from "vitest";
import { getIosSourceCanvas, getPreviewContentRect, mirrorContentRect, stretchPointToInsets } from "@/lib/theme/preview/bubbleCanvas";
import { centeredBubbleGeometry } from "@/lib/theme/bubbleGeometry";
import type { BubbleAsset, BubbleSlot } from "@/lib/theme/types";

// getPreviewContentRect는 ctx 없이 순수 기하 계산만 하므로 캔버스 없이 검증할 수 있다.
// fullCanvas/innerCanvas는 width/height만 읽히므로 최소 stub으로 충분하다.
function canvasStub(width: number, height: number) {
  return { width, height } as HTMLCanvasElement;
}

function bubbleAsset(name: string, slot: BubbleSlot, sourceWidth: number, sourceHeight: number): BubbleAsset {
  return {
    slot,
    name,
    fullCanvas: canvasStub(sourceWidth, sourceHeight),
    innerCanvas: canvasStub(sourceWidth, sourceHeight),
    width: sourceWidth,
    height: sourceHeight,
    markers: {
      top: { start: 1, end: sourceWidth - 1 },
      left: { start: 1, end: sourceHeight - 1 },
      right: { start: 1, end: sourceHeight - 1 },
      bottom: { start: 1, end: sourceWidth - 1 },
    },
    invalidPixels: [],
  };
}

describe("getIosSourceCanvas", () => {
  it(".9.png는 마커 테두리를 제외한 innerCanvas를 소스로 쓴다", () => {
    const asset = bubbleAsset("bubble.9.png", "me", 300, 200);
    asset.innerCanvas = canvasStub(298, 198);
    expect(getIosSourceCanvas(asset)).toBe(asset.innerCanvas);
  });

  it("일반 png는 fullCanvas를 소스로 쓴다", () => {
    const asset = bubbleAsset("bubble.png", "me", 300, 200);
    expect(getIosSourceCanvas(asset)).toBe(asset.fullCanvas);
  });
});

describe("stretchPointToInsets", () => {
  it("stretch 좌표를 4방향 inset으로 바꾼다", () => {
    expect(stretchPointToInsets({ x: 40, y: 30 }, 100, 80)).toEqual({ top: 30, right: 59, bottom: 49, left: 40 });
  });

  it("소스 밖 좌표는 소스 경계로 clamp한다", () => {
    expect(stretchPointToInsets({ x: 999, y: -5 }, 100, 80)).toEqual({ top: 0, right: 0, bottom: 79, left: 99 });
  });
});

describe("getPreviewContentRect", () => {
  it("에셋이 없으면 고정 여백 사각형을 쓴다", () => {
    expect(getPreviewContentRect(null, "ios", undefined, 10, 20, 200, 120)).toEqual({ x: 38, y: 40, width: 144, height: 80 });
  });

  it("iOS는 편집값이 없으면 이미지 크기에 맞춘 가운데 기본 inset을 쓴다", () => {
    const asset = bubbleAsset("bubble.png", "me", 300, 200);
    const { top, right, bottom, left } = centeredBubbleGeometry(300, 200).contentInsets;

    const rect = getPreviewContentRect(asset, "ios", undefined, 0, 0, 400, 300);

    expect(rect).toEqual({ x: left, y: top, width: 400 - left - right, height: 300 - top - bottom });
  });

  it("iOS는 편집 geometry의 contentInsets를 우선 적용한다", () => {
    const asset = bubbleAsset("bubble.png", "me", 300, 200);
    const edit = { geometry: { contentInsets: { top: 10, right: 20, bottom: 30, left: 40 } } } as Parameters<typeof getPreviewContentRect>[2];

    const rect = getPreviewContentRect(asset, "ios", edit, 5, 7, 400, 300);

    expect(rect).toEqual({ x: 45, y: 17, width: 340, height: 260 });
  });

  // 프리뷰(ChatroomPreview)와 썸네일이 같은 모듈을 쓰므로, 같은 입력은 같은 사각형을 내야 한다.
  it("같은 입력에 대해 항상 같은 결과를 낸다", () => {
    const asset = bubbleAsset("bubble.9.png", "you", 300, 200);
    const args = [asset, "ios", undefined, 12, 34, 260, 180] as const;

    expect(getPreviewContentRect(...args)).toEqual(getPreviewContentRect(...args));
  });
});

describe("mirrorContentRect", () => {
  const rect = { x: 45, y: 17, width: 340, height: 260 };

  it("반전이 아니면 사각형을 그대로 돌려준다", () => {
    expect(mirrorContentRect(rect, false, 5, 400)).toBe(rect);
  });

  it("말풍선 rect의 세로 중심축을 기준으로 좌우를 바꾼다", () => {
    // 말풍선은 x=5에서 폭 400이므로 오른쪽 끝은 405. 왼쪽 여백 40 / 오른쪽 여백 20이 서로 바뀐다.
    expect(mirrorContentRect(rect, true, 5, 400)).toEqual({ x: 25, y: 17, width: 340, height: 260 });
  });

  it("세로 값과 크기는 건드리지 않는다", () => {
    const mirrored = mirrorContentRect(rect, true, 5, 400);
    expect(mirrored.y).toBe(rect.y);
    expect(mirrored.width).toBe(rect.width);
    expect(mirrored.height).toBe(rect.height);
  });

  it("두 번 뒤집으면 원래 위치로 돌아온다", () => {
    expect(mirrorContentRect(mirrorContentRect(rect, true, 5, 400), true, 5, 400)).toEqual(rect);
  });
});
