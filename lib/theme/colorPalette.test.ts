import { describe, expect, it } from "vitest";
import { compositeOverBackground } from "@/lib/theme/colorPalette";

function pixel(red: number, green: number, blue: number, alpha: number) {
  return [red, green, blue, alpha];
}

function buffer(...pixels: number[][]) {
  return new Uint8ClampedArray(pixels.flat());
}

/**
 * 말풍선 글자색이 말풍선이 아니라 채팅방 배경을 따라가던 원인.
 *
 * 예전에는 캔버스를 배경색으로 칠한 뒤 이미지를 그렸다. 그러면 투명한 자리도 불투명한 픽셀이
 * 되어, 뒤이어 도는 집계의 `alpha < 0.15` 걸러내기를 통과해 배경색 표를 던졌다. 나인패치
 * 아트보드는 실제 말풍선보다 훨씬 커서(빌더 기본값 250×230 캔버스에 95×80 본체 = 13%)
 * 평균의 대부분이 채팅방 배경이 됐다.
 */
describe("compositeOverBackground", () => {
  it("완전히 투명한 자리는 알파를 0으로 남긴다", () => {
    const pixels = buffer(pixel(0, 0, 0, 0));

    compositeOverBackground(pixels, "#FF0000");

    // 색은 배경으로 채워지지만 알파가 0이라 집계에서 빠진다. 이 한 줄이 수정의 핵심이다.
    expect(pixels[3]).toBe(0);
    expect([pixels[0], pixels[1], pixels[2]]).toEqual([255, 0, 0]);
  });

  it("불투명한 자리는 손대지 않는다", () => {
    const pixels = buffer(pixel(10, 200, 30, 255));

    compositeOverBackground(pixels, "#FF0000");

    expect(Array.from(pixels)).toEqual([10, 200, 30, 255]);
  });

  it("반투명한 자리만 배경과 섞는다", () => {
    // 반투명 말풍선은 뒤에 깔린 것과 합쳐진 색으로 보이므로 이 합성 자체는 필요하다.
    const pixels = buffer(pixel(0, 0, 0, 128));

    compositeOverBackground(pixels, "#FFFFFF");

    const alpha = 128 / 255;
    expect(pixels[0]).toBeCloseTo(255 * (1 - alpha), 0);
    // 알파는 그대로 남아 가중치로 쓰인다.
    expect(pixels[3]).toBe(128);
  });

  it("투명한 여백이 넓어도 집계 가중치는 불투명한 그림 쪽이 갖는다", () => {
    // 말풍선 아트보드를 흉내낸다 — 여백 7픽셀, 본체 1픽셀.
    const pixels = buffer(
      ...Array.from({ length: 7 }, () => pixel(0, 0, 0, 0)),
      pixel(0, 0, 255, 255),
    );

    compositeOverBackground(pixels, "#FF0000");

    const opaque = [];
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] / 255 >= 0.15) opaque.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
    }
    // 배경(빨강)은 한 표도 없다. 예전 방식에서는 8표 중 7표가 빨강이었다.
    expect(opaque).toEqual([[0, 0, 255]]);
  });
});
