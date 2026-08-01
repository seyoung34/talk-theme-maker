import { afterEach, describe, expect, it, vi } from "vitest";
import { collectInvalidBorderPixels, defaultMarkers, exportNinePatch, parseMarkers, parsePlainImage, shrinkFixed, type BorderPixels } from "@/lib/theme/android/ninepatch";

const black: [number, number, number, number] = [0, 0, 0, 255];
const clear: [number, number, number, number] = [0, 0, 0, 0];
const red: [number, number, number, number] = [255, 0, 0, 255];

// 지정한 인덱스만 마커(불투명 검정)로 칠한 1px 스트립을 만든다.
function strip(length: number, painted: Partial<Record<number, [number, number, number, number]>> = {}) {
  const data = new Uint8ClampedArray(length * 4);
  for (let index = 0; index < length; index += 1) {
    const [r, g, b, a] = painted[index] ?? clear;
    data.set([r, g, b, a], index * 4);
  }
  return { data };
}

function createBorder(width: number, height: number, edges: Partial<Record<keyof BorderPixels, Partial<Record<number, [number, number, number, number]>>>> = {}): BorderPixels {
  return {
    top: strip(width, edges.top),
    bottom: strip(width, edges.bottom),
    left: strip(height, edges.left),
    right: strip(height, edges.right),
  };
}

describe("parseMarkers", () => {
  it("각 변의 검정 마커 구간을 읽는다", () => {
    const border = createBorder(10, 8, {
      top: { 3: black, 4: black, 5: black },
      left: { 2: black, 3: black },
      right: { 1: black, 2: black, 3: black, 4: black, 5: black, 6: black },
      bottom: { 1: black, 2: black, 3: black, 4: black, 5: black, 6: black, 7: black, 8: black },
    });

    const markers = parseMarkers(border, 10, 8);

    expect(markers.top).toEqual({ start: 3, end: 6 });
    expect(markers.left).toEqual({ start: 2, end: 4 });
    expect(markers.right).toEqual({ start: 1, end: 7 });
    expect(markers.bottom).toEqual({ start: 1, end: 9 });
  });

  it("마커가 없는 변은 기본값으로 되돌린다", () => {
    const border = createBorder(10, 8);
    expect(parseMarkers(border, 10, 8)).toEqual(defaultMarkers(10, 8));
  });

  it("모서리 픽셀은 마커로 세지 않는다", () => {
    // 안드로이드 나인패치에서 네 모서리는 항상 비어 있어야 한다.
    const border = createBorder(6, 6, { top: { 0: black, 5: black } });
    expect(parseMarkers(border, 6, 6).top).toEqual(defaultMarkers(6, 6).top);
  });
});

describe("collectInvalidBorderPixels", () => {
  it("투명하지도 검정도 아닌 테두리 픽셀을 좌표와 함께 모은다", () => {
    const border = createBorder(4, 3, { top: { 1: red }, right: { 1: red } });

    const invalid = collectInvalidBorderPixels(border, 4, 3);

    expect(invalid).toEqual([
      { x: 1, y: 0, rgba: red },
      { x: 3, y: 1, rgba: red },
    ]);
  });

  it("마커와 투명 픽셀만 있으면 비어 있다", () => {
    const border = createBorder(4, 3, { top: { 1: black, 2: black }, bottom: { 1: black } });
    expect(collectInvalidBorderPixels(border, 4, 3)).toEqual([]);
  });
});

describe("shrinkFixed", () => {
  it("고정 폭 합이 대상보다 작으면 그대로 둔다", () => {
    expect(shrinkFixed(10, 20, 100)).toEqual([10, 20]);
  });

  it("고정 폭 합이 대상을 넘으면 비례 축소한다", () => {
    expect(shrinkFixed(30, 30, 30)).toEqual([15, 15]);
  });
});



afterEach(() => {
  vi.restoreAllMocks();
});

describe("plain PNG to Android 9-patch", () => {
  it("artwork 바깥에 marker border 공간을 추가해 가장자리 픽셀을 보존한다", () => {
    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context);

    const source = { width: 20, height: 10 } as ImageBitmap;
    const asset = parsePlainImage(source, "bubble.png", "me");
    const exported = exportNinePatch(asset);

    expect(asset.innerCanvas).toBe(asset.fullCanvas);
    expect(asset.innerCanvas.width).toBe(20);
    expect(asset.innerCanvas.height).toBe(10);
    expect(asset.width).toBe(22);
    expect(asset.height).toBe(12);
    expect(exported.width).toBe(22);
    expect(exported.height).toBe(12);
    expect(drawImage).toHaveBeenLastCalledWith(asset.innerCanvas, 0, 0, 20, 10, 1, 1, 20, 10);
  });
});
