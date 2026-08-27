import { afterEach, describe, expect, it, vi } from "vitest";
import { fullBubbleDecorationContentBox, getOpaqueContentBox } from "@/lib/theme/bubbleBuilder/alphaBounds";

/**
 * happy-dom에는 그림을 그릴 수 있는 2D 컨텍스트가 없다. 훑기 자체를 검증하려면 픽셀을 직접
 * 돌려주는 컨텍스트를 끼워야 한다.
 */
function stubCanvas(pixels: { width: number; height: number; opaque: (x: number, y: number) => boolean } | null) {
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const element = original(tag as "canvas", options);
    if (tag !== "canvas") return element;
    Object.assign(element, {
      getContext: () => (pixels
        ? {
          clearRect: () => {},
          drawImage: () => {},
          getImageData: (_x: number, _y: number, width: number, height: number) => {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                // 훑기 해상도로 줄여 그린 것을 흉내 낸다. 원본 좌표로 되돌려 물어본다.
                const sourceX = Math.floor((x / width) * pixels.width);
                const sourceY = Math.floor((y / height) * pixels.height);
                data[(y * width + x) * 4 + 3] = pixels.opaque(sourceX, sourceY) ? 255 : 0;
              }
            }
            return { data, width, height };
          },
        }
        : null),
    });
    return element;
  });
}

afterEach(() => vi.restoreAllMocks());

const source = {} as CanvasImageSource;

describe("getOpaqueContentBox", () => {
  it("finds the opaque band inside a mostly transparent image", () => {
    // 200x160 안에서 세로 60~100 구간만 그림. 위아래 각각 37.5%가 투명 여백이다.
    stubCanvas({ width: 200, height: 160, opaque: (_x, y) => y >= 60 && y < 100 });

    const box = getOpaqueContentBox(source, 200, 160);

    expect(box.x).toBeCloseTo(0, 1);
    expect(box.width).toBeCloseTo(1, 1);
    expect(box.y).toBeCloseTo(0.375, 1);
    expect(box.height).toBeCloseTo(0.25, 1);
  });

  it("returns the whole image when every pixel is opaque", () => {
    stubCanvas({ width: 64, height: 64, opaque: () => true });

    expect(getOpaqueContentBox(source, 64, 64)).toEqual(fullBubbleDecorationContentBox);
  });

  it("returns the whole image when nothing is opaque", () => {
    // 잘라낼 것이 없다. 여기서 0 크기를 돌려주면 그 장식은 영영 잡을 수 없게 된다.
    stubCanvas({ width: 64, height: 64, opaque: () => false });

    expect(getOpaqueContentBox(source, 64, 64)).toEqual(fullBubbleDecorationContentBox);
  });

  it("falls back to the whole image when pixels cannot be read", () => {
    // 캔버스를 못 쓰는 환경에서는 판정이 느슨해질 뿐 예전과 같이 동작해야 한다.
    stubCanvas(null);

    expect(getOpaqueContentBox(source, 64, 64)).toEqual(fullBubbleDecorationContentBox);
    expect(getOpaqueContentBox(source, 0, 0)).toEqual(fullBubbleDecorationContentBox);
  });
});
