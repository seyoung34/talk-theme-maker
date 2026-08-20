import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { transformCatalogImage } from "./catalogImageTransform";

describe("Cloud Run catalog image transforms", () => {
  it("plain PNG를 Android nine-patch PNG로 감싼다", async () => {
    const input = await createPng(4, 3, (x, y) => [x + 1, y + 10, 80, 255]);
    const output = await transformCatalogImage(input, {
      fileName: "bubble.png",
      sourceScale: 3,
      width: 4,
      height: 3,
    }, {
      kind: "android-nine-patch",
      outputFormat: "png",
    });
    const decoded = await readPng(output);

    expect([decoded.info.width, decoded.info.height]).toEqual([6, 5]);
    expect(pixel(decoded.data, decoded.info.width, 1, 1)).toEqual([1, 10, 80, 255]);
    expect(pixel(decoded.data, decoded.info.width, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(decoded.data, decoded.info.width, 2, 0)).toEqual([0, 0, 0, 255]);
  });

  it("iOS scale transform은 source scale과 target path의 픽셀 크기를 맞춘다", async () => {
    const input = await createPng(6, 4, (x, y) => [x, y, 120, 255]);
    const output = await transformCatalogImage(input, {
      fileName: "main@3x.png",
      sourceScale: 3,
      width: 6,
      height: 4,
    }, {
      kind: "ios-image",
      outputFormat: "png",
      sourceScale: 3,
      targetScale: 2,
      sourceDimensions: { width: 6, height: 4 },
    });
    const decoded = await readPng(output);

    expect([decoded.info.width, decoded.info.height]).toEqual([4, 3]);
  });

  it("iOS는 Android nine-patch border를 제거하고 좌우반전한다", async () => {
    const input = await createPng(6, 4, (x, y) => {
      if (x === 0 || y === 0 || x === 5 || y === 3) return [0, 0, 0, 255];
      return [x, y, 200, 255];
    });
    const output = await transformCatalogImage(input, {
      fileName: "bubble.9.png",
      sourceScale: 3,
      width: 6,
      height: 4,
    }, {
      kind: "ios-image",
      outputFormat: "png",
      sourceScale: 3,
      targetScale: 3,
      stripNinePatchBorder: true,
      flipX: true,
      sourceDimensions: { width: 4, height: 2 },
    });
    const decoded = await readPng(output);

    expect([decoded.info.width, decoded.info.height]).toEqual([4, 2]);
    expect(pixel(decoded.data, decoded.info.width, 0, 0)).toEqual([4, 1, 200, 255]);
  });
});

async function createPng(width: number, height: number, colorAt: (x: number, y: number) => [number, number, number, number]) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      raw.set(colorAt(x, y), offset);
    }
  }
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

async function readPng(bytes: Uint8Array) {
  return sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function pixel(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [...data.subarray(offset, offset + 4)];
}
