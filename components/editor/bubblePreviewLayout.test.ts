import { describe, expect, it } from "vitest";
import {
  bubblePreviewHandleInset,
  bubblePreviewZoomRange,
  clampBubblePreviewPan,
  clampBubblePreviewZoom,
  getBubblePreviewFitScale,
  getBubblePreviewLayout,
  getBubblePreviewZoomPan,
} from "@/components/editor/bubblePreviewLayout";

const maxCanvas = { width: 350, height: 322 };

describe("bubble preview fit scale", () => {
  it("fits the largest frame inside the viewport, handles included", () => {
    const scale = getBubblePreviewFitScale({ width: 350, height: 1000 }, maxCanvas);

    expect(scale * maxCanvas.width).toBeLessThanOrEqual(350);
    expect(350 - scale * maxCanvas.width).toBeGreaterThanOrEqual(bubblePreviewHandleInset * 2 - 1);
  });

  it("takes the tighter of width and height", () => {
    // 세로가 짧으면 세로가 정한다 — 모바일 전체 화면에서 무대가 위아래로 잘리지 않게 한다.
    const wide = getBubblePreviewFitScale({ width: 900, height: 200 }, maxCanvas);

    expect(wide).toBeCloseTo((200 - bubblePreviewHandleInset * 2) / maxCanvas.height);
  });

  it("falls back to 1 before the viewport is measured", () => {
    expect(getBubblePreviewFitScale({}, maxCanvas)).toBe(1);
  });
});

/**
 * 프레임을 줄이면 화면 위 무대도 줄어야 손잡이를 끈 결과가 보인다. 대신 그렇게 작아진 프레임을
 * 세밀하게 손볼 수 있도록 보기 배율은 따로 둔다 — 예전에는 이 둘이 한 값이었다.
 */
describe("bubble preview layout", () => {
  const viewport = { width: 480, height: 420 };

  it("grows the stage with the frame at a fixed zoom", () => {
    const small = getBubblePreviewLayout({ width: 250, height: 230 }, maxCanvas, viewport);
    const large = getBubblePreviewLayout(maxCanvas, maxCanvas, viewport);

    expect(large.stageWidth).toBeGreaterThan(small.stageWidth);
    expect(large.stageHeight).toBeGreaterThan(small.stageHeight);
    expect(small.scale).toBe(large.scale);
  });

  it("multiplies the fit scale by the user zoom", () => {
    const fitted = getBubblePreviewLayout({ width: 250, height: 230 }, maxCanvas, viewport);
    const zoomed = getBubblePreviewLayout({ width: 250, height: 230 }, maxCanvas, viewport, 2);

    expect(zoomed.fitScale).toBe(fitted.fitScale);
    expect(zoomed.scale).toBeCloseTo(fitted.scale * 2);
    expect(zoomed.stageWidth).toBeCloseTo(fitted.stageWidth * 2);
  });

  it("clamps the zoom to the allowed range", () => {
    expect(clampBubblePreviewZoom(99)).toBe(bubblePreviewZoomRange.max);
    expect(clampBubblePreviewZoom(0)).toBe(bubblePreviewZoomRange.min);
  });
});

describe("bubble preview pan", () => {
  const viewport = { width: 400, height: 400 };

  it("holds a stage that already fits near the centre", () => {
    const pan = clampBubblePreviewPan({ x: 500, y: -500 }, { width: 200, height: 200 }, viewport);

    expect(pan).toEqual({ x: bubblePreviewHandleInset * 2, y: -bubblePreviewHandleInset * 2 });
  });

  it("opens up exactly the overflow once the stage is larger than the viewport", () => {
    const pan = clampBubblePreviewPan({ x: 500, y: 0 }, { width: 800, height: 400 }, viewport);

    expect(pan.x).toBe(200 + bubblePreviewHandleInset * 2);
  });

  it("keeps the anchored point still while zooming", () => {
    // 앵커를 무시하면 늘 무대 한가운데가 확대돼 집은 곳이 화면 밖으로 밀린다.
    const anchor = { x: 100, y: 40 };
    const pan = getBubblePreviewZoomPan({ x: 0, y: 0 }, anchor, 2);

    expect(pan).toEqual({ x: -100, y: -40 });
  });
});
