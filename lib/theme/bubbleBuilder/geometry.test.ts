import { describe, expect, it } from "vitest";
import { fullBubbleDecorationContentBox } from "@/lib/theme/bubbleBuilder/alphaBounds";
import { bubbleBodyScaleRange, bubbleDecorationBaseSize, getBubbleDecorationContentRect, getBubbleDecorationTransformedContentBox, rectsOverlap, createBubbleDecorationLayer, createBubbleFamilyDesignSpec, crossesBubbleStretch, getAndroidBubbleMarkers, getBubbleCanvasSize, getBubbleDecorationHandleRadius, getBubbleDecorationLayers, getBubbleDecorationRect, getBubbleDecorationSize, getBubbleRadiusMax, getBubbleTextColorForFill, getBubbleVariantGeometry, getIosBubbleGeometry } from "@/lib/theme/bubbleBuilder/geometry";
import type { BubbleSideDesignSpec } from "@/lib/theme/bubbleBuilder/types";

const baseDesign: BubbleSideDesignSpec = {
  side: "me",
  preset: "rounded",
  radius: 24,
  fill: "#FFE27A",
  borderColor: "#334155",
  borderWidth: 3,
  textColor: "#111111",
  syncTextColorOnApply: false,
};

describe("bubble builder geometry", () => {
  it("starts with no decoration and places new layers centered above the body", () => {
    expect(createBubbleFamilyDesignSpec("me").design).toMatchObject({ borderColor: "#222222", textColor: "#000000", syncTextColorOnApply: true, decorations: [] });
    expect(createBubbleDecorationLayer("layer-1", "cat.png")).toMatchObject({
      id: "layer-1",
      sourceName: "cat.png",
      offsetX: 0,
      offsetY: -64,
      scale: 1.6,
      flipX: false,
    });
  });

  it("chooses pure black or white text from the bubble fill", () => {
    expect(getBubbleTextColorForFill("#FFFFFF")).toBe("#000000");
    expect(getBubbleTextColorForFill("#FFE27A")).toBe("#000000");
    expect(getBubbleTextColorForFill("#202020")).toBe("#FFFFFF");
  });

  it("reads legacy single-decoration recipes as one layer keyed by familyId", () => {
    const legacy = {
      ...createBubbleFamilyDesignSpec("me"),
      familyId: "family-1",
      decorationSourceName: "old.png",
      design: { ...baseDesign, decorations: undefined, decoration: { offsetX: 12, offsetY: -20, scale: 1.2, flipX: true } },
    };

    expect(getBubbleDecorationLayers(legacy)).toEqual([
      { id: "family-1", sourceName: "old.png", offsetX: 12, offsetY: -20, scale: 1.2, flipX: true },
    ]);
  });

  it("keeps first and group geometry independent", () => {
    const first = getBubbleVariantGeometry(baseDesign, "first");
    const group = getBubbleVariantGeometry(baseDesign, "group");

    expect(first.canvas).toEqual({ width: 250, height: 230 });
    expect(group.canvas).toEqual({ width: 250, height: 190 });
    expect(first.body.height).toBe(80);
    expect(group.body.height).toBe(60);
    expect(first.content.height).toBeGreaterThan(group.content.height);
  });

  it("allows a true capsule radius instead of applying a flat-band clamp", () => {
    const design = { ...baseDesign, preset: "capsule" as const, radius: 999 };
    const geometry = getBubbleVariantGeometry(design, "first");

    expect(getBubbleRadiusMax("capsule", "first")).toBe(40);
    expect(geometry.radius).toBe(40);
    expect(geometry.stretch).toEqual({ x: 125, y: 115 });
  });

  it("shifts the body within the canvas by bodyOffset and clamps to bounds", () => {
    const moved = getBubbleVariantGeometry({ ...baseDesign, bodyOffsetX: 20, bodyOffsetY: -10 }, "first");
    expect(moved.body.x).toBe(98);
    expect(moved.body.y).toBe(65);

    const clamped = getBubbleVariantGeometry({ ...baseDesign, bodyOffsetX: 9999, bodyOffsetY: -9999 }, "first");
    expect(clamped.body.x).toBe(250 - 95);
    expect(clamped.body.y).toBe(0);
  });

  /**
   * `말풍선 크기` 컨트롤은 없앴지만 저장된 값은 계속 읽는다. 1로 눌러 버리면 이미 만들어 둔
   * 테마의 여백이 조용히 달라진다.
   */
  it("still honours a body scale stored by an older builder", () => {
    expect(getBubbleVariantGeometry({ ...baseDesign, bodyScale: 1.25 }, "first").body).toMatchObject({ width: 119, height: 100 });
    expect(getBubbleVariantGeometry({ ...baseDesign, bodyScale: undefined }, "first").body).toMatchObject({ width: 95, height: 80 });
    // 범위 밖 값은 눌러서 본체가 캔버스를 벗어나지 않게 한다.
    expect(getBubbleVariantGeometry({ ...baseDesign, bodyScale: 99 }, "first").body.width).toBe(Math.round(95 * bubbleBodyScaleRange.max));
  });

  it("scales the body and moves the radius ceiling with it", () => {
    const bigger = getBubbleVariantGeometry({ ...baseDesign, bodyScale: 1.4 }, "first");
    const smaller = getBubbleVariantGeometry({ ...baseDesign, bodyScale: 0.7 }, "first");

    expect(bigger.body).toMatchObject({ width: 133, height: 112 });
    expect(smaller.body).toMatchObject({ width: 67, height: 56 });
    // 캔버스는 그대로이고 본체만 커지므로 여백이 줄어든다. 중앙 정렬도 유지된다.
    expect(bigger.canvas).toEqual({ width: 250, height: 230 });
    expect(bigger.body.x).toBe(Math.round((250 - 133) / 2));
    expect(getBubbleRadiusMax("rounded", "first", 1.4)).toBe(56);
    expect(getBubbleRadiusMax("rounded", "first", 0.7)).toBe(28);
  });

  it("resizes the canvas without changing the body", () => {
    const wide = getBubbleVariantGeometry({ ...baseDesign, canvasWidth: 300, canvasHeight: 300 }, "first");

    expect(wide.canvas).toEqual({ width: 300, height: 300 });
    expect(wide.body.width).toBe(95);
    expect(wide.body.height).toBe(80);
    // 여백이 늘어난 만큼 본체는 안쪽으로 밀린다.
    expect(wide.body.x).toBe(Math.round((300 - 95) / 2));
  });

  it("resizes canvas width and height independently", () => {
    // 두 축이 묶여 있으면 원본 비율(250:230)을 벗어날 수 없어 직사각형 프레임을 만들지 못한다.
    const geometry = getBubbleVariantGeometry({ ...baseDesign, canvasWidth: 300, canvasHeight: 150 }, "first");

    expect(geometry.canvas).toEqual({ width: 300, height: 150 });
    expect(geometry.body).toMatchObject({ width: 95, height: 80 });
    expect(geometry.body.x).toBe(Math.round((300 - 95) / 2));
    expect(geometry.body.y).toBe(Math.round((150 - 80) / 2));
  });

  /**
   * 배율로 저장하던 시절의 spec을 픽셀로 읽는다. 못 읽으면 이미 만들어 둔 말풍선의 프레임이
   * 조용히 기본 크기로 돌아간다.
   */
  it("reads legacy scale fields as pixels", () => {
    expect(getBubbleCanvasSize({ canvasScale: 1.2 }, "first")).toEqual({ width: 300, height: 276 });
    // 축별 값이 있으면 그쪽이 이긴다.
    expect(getBubbleCanvasSize({ canvasScale: 1.2, canvasScaleY: 0.8 }, "first")).toEqual({ width: 300, height: 184 });
    // 픽셀이 있으면 배율보다 우선한다.
    expect(getBubbleCanvasSize({ canvasWidth: 200, canvasHeight: 180, canvasScale: 1.2 }, "first")).toEqual({ width: 200, height: 180 });
    // 옛 상한(1.4배 = 350)은 새 상한 300으로 눌린다.
    expect(getBubbleCanvasSize({ canvasScale: 1.4 }, "first")).toEqual({ width: 300, height: 300 });
  });

  it("clamps out-of-range sizes instead of letting the body escape the canvas", () => {
    const geometry = getBubbleVariantGeometry({ ...baseDesign, bodyScale: 99, canvasWidth: 1, canvasHeight: 9999 }, "first");

    expect(geometry.canvas).toEqual({ width: 150, height: 300 });
    expect(geometry.body.width).toBeLessThanOrEqual(geometry.canvas.width);
    expect(geometry.body.height).toBeLessThanOrEqual(geometry.canvas.height);
    expect(geometry.body.x).toBeGreaterThanOrEqual(0);
    expect(geometry.body.y).toBeGreaterThanOrEqual(0);
  });

  it("keeps default geometry unchanged when no size is stored", () => {
    // 저장된 옛 spec에는 프레임 필드가 없다. 기본값이 변하면 기존 말풍선이 조용히 달라진다.
    expect(getBubbleVariantGeometry(baseDesign, "first")).toEqual(
      getBubbleVariantGeometry({ ...baseDesign, bodyScale: 1, canvasWidth: 250, canvasHeight: 230 }, "first"),
    );
    expect(getBubbleVariantGeometry(baseDesign, "group").canvas).toEqual({ width: 250, height: 190 });
  });

  it("makes the circle body square and preserves a text-safe rect", () => {
    const geometry = getBubbleVariantGeometry({ ...baseDesign, preset: "circle", radius: 999 }, "first");

    expect(geometry.body.width).toBe(geometry.body.height);
    expect(geometry.radius).toBe(geometry.body.width / 2);
    expect(geometry.content.width).toBeGreaterThanOrEqual(24);
    expect(geometry.content.height).toBeGreaterThanOrEqual(24);
  });

  /**
   * 9-slice는 `stretch` 지점의 픽셀 열·행을 반복한다. 그 지점에 걸친 그림만 늘어나고, 한쪽에
   * 몰려 있으면 통째로 밀릴 뿐 모양은 그대로다.
   */
  describe("crossesBubbleStretch", () => {
    const stretch = { x: 125, y: 115 };

    it("한쪽에 몰려 있으면 늘어나지 않는다", () => {
      expect(crossesBubbleStretch({ x: 10, y: 10, width: 80, height: 80 }, stretch)).toBe(false);
      expect(crossesBubbleStretch({ x: 140, y: 130, width: 80, height: 80 }, stretch)).toBe(false);
    });

    it("가로나 세로 어느 한쪽만 걸쳐도 늘어난다", () => {
      expect(crossesBubbleStretch({ x: 100, y: 10, width: 80, height: 40 }, stretch)).toBe(true);
      expect(crossesBubbleStretch({ x: 10, y: 100, width: 40, height: 80 }, stretch)).toBe(true);
    });

    it("경계에 닿기만 한 것은 걸친 것이 아니다", () => {
      // 오른쪽 끝이 정확히 stretch.x면 늘어나는 열의 왼쪽에서 끝난다.
      expect(crossesBubbleStretch({ x: 45, y: 10, width: 80, height: 40 }, stretch)).toBe(false);
      expect(crossesBubbleStretch({ x: 125, y: 10, width: 80, height: 40 }, stretch)).toBe(false);
    });
  });

  it("stores iOS geometry in source pixels", () => {
    const geometry = getBubbleVariantGeometry(baseDesign, "first");
    const ios = getIosBubbleGeometry(geometry);

    expect(ios.stretch).toEqual(geometry.stretch);
    expect(ios.insets.left + geometry.content.width + ios.insets.right).toBe(geometry.canvas.width);
    expect(ios.insets.top + geometry.content.height + ios.insets.bottom).toBe(geometry.canvas.height);
  });

  /**
   * 클릭 영역·겹침 판정·미리보기 상자가 모두 이 사각형을 쓴다. 정사각형 근사를 쓰던 동안에는
   * 넓적한 그림의 빈 위아래가 클릭을 먹어 그 아래 말풍선 본체를 잡을 수 없었다.
   */
  describe("decoration rect", () => {
    it("keeps the source aspect ratio instead of a square box", () => {
      const size = getBubbleDecorationSize({ scale: 1 }, { width: 200, height: 80 });

      expect(size.width).toBeCloseTo(bubbleDecorationBaseSize);
      expect(size.height).toBeCloseTo(bubbleDecorationBaseSize * 0.4);
    });

    it("never enlarges a source smaller than the base size", () => {
      // 렌더는 baseScale을 1로 묶어 작은 원본을 키우지 않는다. 미리보기도 같아야 한다.
      expect(getBubbleDecorationSize({ scale: 1 }, { width: 32, height: 32 })).toEqual({ width: 32, height: 32 });
      expect(getBubbleDecorationSize({ scale: 2 }, { width: 32, height: 32 })).toEqual({ width: 64, height: 64 });
    });

    it("falls back to the square approximation before the source is measured", () => {
      expect(getBubbleDecorationSize({ scale: 1.5 }, undefined)).toEqual({
        width: bubbleDecorationBaseSize * 1.5,
        height: bubbleDecorationBaseSize * 1.5,
      });
    });

    it("centers the rect on the canvas plus the layer offset", () => {
      const rect = getBubbleDecorationRect({ scale: 1, offsetX: 10, offsetY: -20 }, { width: 250, height: 230 }, { width: 200, height: 80 });

      expect(rect.x).toBeCloseTo(125 + 10 - 48);
      expect(rect.y).toBeCloseTo(115 - 20 - 19.2);
      expect(rect.width).toBeCloseTo(96);
      expect(rect.height).toBeCloseTo(38.4);
    });

    it("measures the resize handle from the real corner", () => {
      // 정사각형 원본에서는 예전 상수와 같아야 손잡이 감각이 그대로다.
      expect(getBubbleDecorationHandleRadius({ width: 96, height: 96 })).toBeCloseTo(bubbleDecorationBaseSize * Math.SQRT1_2);
      expect(getBubbleDecorationHandleRadius(undefined)).toBeCloseTo(bubbleDecorationBaseSize * Math.SQRT1_2);
      // 넓적한 원본은 모서리가 더 가깝다 — 이걸 무시하면 손잡이를 잡는 순간 크기가 튄다.
      expect(getBubbleDecorationHandleRadius({ width: 200, height: 80 })).toBeCloseTo(Math.hypot(96, 38.4) / 2);
    });
  });

  /**
   * 장식 이미지는 보통 그림 둘레에 투명 여백을 두고 저장된다. 그 여백까지 그림으로 세면
   * 아무것도 닿지 않았는데 `글자 영역과 겹쳐요`가 뜨고, 그림에서 떨어진 빈자리가 클릭을 먹는다.
   */
  describe("decoration content rect", () => {
    // 기본 자리처럼 본체 위쪽에 걸치게 둔다. 전체 사각형은 글자 영역에 닿고 그림 띠는 닿지 않는다.
    const layer = { scale: 1, offsetX: 0, offsetY: -46 };
    const canvas = { width: 250, height: 230 };
    const source = { width: 200, height: 160 };

    it("falls back to the whole rect when the opaque area is unknown", () => {
      expect(getBubbleDecorationContentRect(layer, canvas, source)).toEqual(getBubbleDecorationRect(layer, canvas, source));
      expect(getBubbleDecorationContentRect(layer, canvas, source, fullBubbleDecorationContentBox))
        .toEqual(getBubbleDecorationRect(layer, canvas, source));
    });

    it("shrinks to the opaque band inside the source", () => {
      // 가운데 25% 높이만 그림이고 위아래는 투명한 이미지.
      const rect = getBubbleDecorationContentRect(layer, canvas, source, { x: 0, y: 0.375, width: 1, height: 0.25 });
      const full = getBubbleDecorationRect(layer, canvas, source);

      expect(rect.width).toBeCloseTo(full.width);
      expect(rect.height).toBeCloseTo(full.height * 0.25);
      expect(rect.y).toBeCloseTo(full.y + full.height * 0.375);
      // 여백을 빼면 글자 영역에 닿지 않는다 — 예전 판정은 여기서 오탐을 냈다.
      const geometry = getBubbleVariantGeometry({ ...baseDesign, borderWidth: 4 }, "first");
      expect(rectsOverlap(full, geometry.content)).toBe(true);
      expect(rectsOverlap(rect, geometry.content)).toBe(false);
    });

    it("moves the resize handle reference onto the opaque corner", () => {
      // 손잡이가 보이는 그림의 모서리로 옮겨 갔으므로 기준 거리도 같이 가야 크기가 안 튄다.
      const box = { x: 0, y: 0.375, width: 1, height: 0.25 };
      const base = getBubbleDecorationSize({ scale: 1 }, source);

      expect(getBubbleDecorationHandleRadius(source, box))
        .toBeCloseTo(Math.hypot(base.width / 2, base.height * 0.625 - base.height / 2));
      expect(getBubbleDecorationHandleRadius(source, box)).toBeLessThan(getBubbleDecorationHandleRadius(source));
    });

    it("mirrors asymmetric alpha bounds when a decoration is flipped", () => {
      const box = { x: 0.1, y: 0.2, width: 0.25, height: 0.3 };
      const flipped = getBubbleDecorationTransformedContentBox({ flipX: true }, box);

      expect(flipped).toEqual({ x: 0.65, y: 0.2, width: 0.25, height: 0.3 });
      expect(getBubbleDecorationContentRect({ ...layer, flipX: false }, canvas, source, box).x)
        .toBeCloseTo(getBubbleDecorationRect(layer, canvas, source).x + 96 * 0.1);
      expect(getBubbleDecorationContentRect({ ...layer, flipX: true }, canvas, source, box).x)
        .toBeCloseTo(getBubbleDecorationRect(layer, canvas, source).x + 96 * 0.65);
      expect(getBubbleDecorationHandleRadius(source, box, true))
        .toBeCloseTo(Math.hypot(96 * 0.9 - 48, 38.4 * 0.5 - 19.2));
    });
  });

  it("adds the Android marker-border offset", () => {
    const geometry = getBubbleVariantGeometry(baseDesign, "first");
    const markers = getAndroidBubbleMarkers(geometry);

    expect(markers.top).toEqual({ start: geometry.stretch.x + 1, end: geometry.stretch.x + 3 });
    expect(markers.left).toEqual({ start: geometry.stretch.y + 1, end: geometry.stretch.y + 3 });
    expect(markers.bottom.end).toBeLessThanOrEqual(geometry.canvas.width + 1);
    expect(markers.right.end).toBeLessThanOrEqual(geometry.canvas.height + 1);
  });
});
