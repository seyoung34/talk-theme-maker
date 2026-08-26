import { describe, expect, it } from "vitest";
import { bubbleBodyScalePresets, bubbleBodyScaleRange, bubbleDecorationBaseSize, createBubbleDecorationLayer, createBubbleFamilyDesignSpec, crossesBubbleStretch, getAndroidBubbleMarkers, getBubbleBodyScalePreset, getBubbleCanvasScale, getBubbleDecorationHandleRadius, getBubbleDecorationLayers, getBubbleDecorationRect, getBubbleDecorationSize, getBubbleRadiusMax, getBubbleVariantGeometry, getIosBubbleGeometry } from "@/lib/theme/bubbleBuilder/geometry";
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
    expect(createBubbleFamilyDesignSpec("me").design.decorations).toEqual([]);
    expect(createBubbleDecorationLayer("layer-1", "cat.png")).toMatchObject({
      id: "layer-1",
      sourceName: "cat.png",
      offsetX: 0,
      offsetY: -64,
      scale: 1.6,
      flipX: false,
    });
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

  it("maps any stored body scale onto the nearest preset", () => {
    // 슬라이더 시절 spec에는 임의의 값이 들어 있다. 못 읽으면 세그먼트가 아무것도 안 눌린 상태로 보인다.
    expect(getBubbleBodyScalePreset(undefined)).toBe("normal");
    expect(getBubbleBodyScalePreset(1)).toBe("normal");
    expect(getBubbleBodyScalePreset(0.72)).toBe("small");
    expect(getBubbleBodyScalePreset(1.38)).toBe("large");
    // 범위 밖 값도 clamp 뒤에 가장 가까운 선택지로 떨어진다.
    expect(getBubbleBodyScalePreset(99)).toBe("large");
    expect(getBubbleBodyScalePreset(0)).toBe("small");
  });

  it("keeps every body scale preset inside the allowed range", () => {
    for (const preset of bubbleBodyScalePresets) {
      expect(preset.value).toBeGreaterThanOrEqual(bubbleBodyScaleRange.min);
      expect(preset.value).toBeLessThanOrEqual(bubbleBodyScaleRange.max);
      // 왕복이 되어야 고른 값이 그대로 다시 선택돼 보인다.
      expect(getBubbleBodyScalePreset(preset.value)).toBe(preset.id);
    }
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

  it("scales the canvas without changing the body", () => {
    const wide = getBubbleVariantGeometry({ ...baseDesign, canvasScaleX: 1.4, canvasScaleY: 1.4 }, "first");

    expect(wide.canvas).toEqual({ width: 350, height: 322 });
    expect(wide.body.width).toBe(95);
    expect(wide.body.height).toBe(80);
    // 여백이 늘어난 만큼 본체는 안쪽으로 밀린다.
    expect(wide.body.x).toBe(Math.round((350 - 95) / 2));
  });

  it("scales canvas width and height independently", () => {
    // 두 축이 묶여 있으면 원본 비율(250:230)을 벗어날 수 없어 직사각형 프레임을 만들지 못한다.
    const geometry = getBubbleVariantGeometry({ ...baseDesign, canvasScaleX: 1.4, canvasScaleY: 0.8 }, "first");

    expect(geometry.canvas).toEqual({ width: 350, height: 184 });
    expect(geometry.body).toMatchObject({ width: 95, height: 80 });
    expect(geometry.body.x).toBe(Math.round((350 - 95) / 2));
    expect(geometry.body.y).toBe(Math.round((184 - 80) / 2));
  });

  it("reads the legacy single canvasScale as both axes", () => {
    // 축이 갈리기 전에 저장된 spec은 한 값만 갖는다. 이걸 못 읽으면 프레임이 기본 크기로 돌아간다.
    expect(getBubbleCanvasScale({ canvasScale: 1.2 })).toEqual({ x: 1.2, y: 1.2 });
    // 축별 값이 있으면 그쪽이 이긴다.
    expect(getBubbleCanvasScale({ canvasScale: 1.2, canvasScaleY: 0.9 })).toEqual({ x: 1.2, y: 0.9 });
    expect(getBubbleVariantGeometry({ ...baseDesign, canvasScale: 1.4 }, "first").canvas).toEqual({ width: 350, height: 322 });
  });

  it("clamps out-of-range scales instead of letting the body escape the canvas", () => {
    const geometry = getBubbleVariantGeometry({ ...baseDesign, bodyScale: 99, canvasScaleX: 0.01, canvasScaleY: 99 }, "first");

    expect(geometry.canvas).toEqual({ width: 200, height: 322 });
    expect(geometry.body.width).toBeLessThanOrEqual(geometry.canvas.width);
    expect(geometry.body.height).toBeLessThanOrEqual(geometry.canvas.height);
    expect(geometry.body.x).toBeGreaterThanOrEqual(0);
    expect(geometry.body.y).toBeGreaterThanOrEqual(0);
  });

  it("keeps default geometry unchanged when no scale is stored", () => {
    // 저장된 옛 spec에는 배율 필드가 없다. 기본값이 1이 아니면 기존 말풍선이 조용히 달라진다.
    expect(getBubbleVariantGeometry(baseDesign, "first")).toEqual(
      getBubbleVariantGeometry({ ...baseDesign, bodyScale: 1, canvasScaleX: 1, canvasScaleY: 1 }, "first"),
    );
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

  it("adds the Android marker-border offset", () => {
    const geometry = getBubbleVariantGeometry(baseDesign, "first");
    const markers = getAndroidBubbleMarkers(geometry);

    expect(markers.top).toEqual({ start: geometry.stretch.x + 1, end: geometry.stretch.x + 3 });
    expect(markers.left).toEqual({ start: geometry.stretch.y + 1, end: geometry.stretch.y + 3 });
    expect(markers.bottom.end).toBeLessThanOrEqual(geometry.canvas.width + 1);
    expect(markers.right.end).toBeLessThanOrEqual(geometry.canvas.height + 1);
  });
});
