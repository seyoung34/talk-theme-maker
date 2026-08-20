import { build } from "esbuild";
import path from "node:path";
import sharp from "sharp";
import { expect, test } from "./fixtures/test";
import type { Page } from "@playwright/test";
import { transformCatalogImage } from "../services/shared/catalogImageTransform";

const projectRoot = path.resolve(process.cwd());

type BrowserParityPayload = {
  base64: string;
  fileName: string;
  targetWidth?: number;
  targetHeight?: number;
  stripNinePatchBorder?: boolean;
};

type BrowserParityApi = {
  android: (payload: BrowserParityPayload) => Promise<string>;
  ios: (payload: BrowserParityPayload) => Promise<string>;
};

let browserParityScript = "";

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { exportNinePatch, parseImage, parsePlainImage } from "./lib/theme/android/ninepatch.ts";

        function fromBase64(value) {
          const binary = atob(value);
          return Uint8Array.from(binary, (character) => character.charCodeAt(0));
        }

        function toBase64(bytes) {
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return btoa(binary);
        }

        async function toPngBase64(canvas) {
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((value) => value ? resolve(value) : reject(new Error("canvas_to_blob_failed")), "image/png");
          });
          return toBase64(new Uint8Array(await blob.arrayBuffer()));
        }

        async function createBitmap(payload) {
          const blob = new Blob([fromBase64(payload.base64)], { type: "image/png" });
          return createImageBitmap(blob);
        }

        globalThis.__catalogParity = {
          async android(payload) {
            const bitmap = await createBitmap(payload);
            try {
              const asset = payload.fileName.toLowerCase().endsWith(".9.png")
                ? parseImage(bitmap, payload.fileName, "me")
                : parsePlainImage(bitmap, payload.fileName, "me");
              return toPngBase64(exportNinePatch(asset));
            } finally {
              bitmap.close();
            }
          },
          async ios(payload) {
            const bitmap = await createBitmap(payload);
            try {
              const sourceWidth = bitmap.width - (payload.stripNinePatchBorder ? 2 : 0);
              const sourceHeight = bitmap.height - (payload.stripNinePatchBorder ? 2 : 0);
              const width = payload.targetWidth ?? sourceWidth;
              const height = payload.targetHeight ?? sourceHeight;
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext("2d");
              if (!context) throw new Error("canvas_context_unavailable");
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "high";
              context.clearRect(0, 0, width, height);
              context.drawImage(
                bitmap,
                payload.stripNinePatchBorder ? 1 : 0,
                payload.stripNinePatchBorder ? 1 : 0,
                sourceWidth,
                sourceHeight,
                0,
                0,
                width,
                height,
              );
              return toPngBase64(canvas);
            } finally {
              bitmap.close();
            }
          },
        };
      `,
      resolveDir: projectRoot,
      sourcefile: "catalog-transform-parity-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    write: false,
  });
  browserParityScript = result.outputFiles[0]?.text ?? "";
  if (!browserParityScript) throw new Error("catalog_transform_parity_bundle_empty");
});

test.describe("catalog 변환 브라우저/Builder parity", () => {
  test("plain PNG Android nine-patch 결과가 Canvas와 sharp에서 같다", async ({ page }) => {
    const input = await createRgbaPng(7, 5, (x, y) => [x * 17, y * 23, 180, 255]);
    const browserBytes = await renderInBrowser(page, "android", {
      base64: input.toString("base64"),
      fileName: "parity-bubble.png",
    });
    const builderBytes = await transformCatalogImage(input, {
      fileName: "parity-bubble.png",
      sourceScale: 3,
      width: 7,
      height: 5,
    }, {
      kind: "android-nine-patch",
      outputFormat: "png",
    });

    await expectSamePixels(browserBytes, builderBytes);
  });

  test("Android .9.png border 제거와 marker 보존 결과가 Canvas와 sharp에서 같다", async ({ page }) => {
    const input = await createRgbaPng(9, 7, (x, y) => {
      if (x === 0 || y === 0 || x === 8 || y === 6) return [0, 0, 0, 255];
      if (y === 1 && x >= 3 && x <= 6) return [0, 0, 0, 255];
      if (x === 0 && y >= 2 && y <= 4) return [0, 0, 0, 255];
      return [x * 11, y * 13, 90, 255];
    });
    const browserBytes = await renderInBrowser(page, "android", {
      base64: input.toString("base64"),
      fileName: "parity-bubble.9.png",
    });
    const builderBytes = await transformCatalogImage(input, {
      fileName: "parity-bubble.9.png",
      sourceScale: 3,
      width: 9,
      height: 7,
    }, {
      kind: "android-nine-patch",
      outputFormat: "png",
    });

    await expectSamePixels(browserBytes, builderBytes);
  });

  test("iOS scale resize의 Canvas/Builder 차이가 허용 오차 안이다", async ({ page }) => {
    const input = await createRgbaPng(12, 8, (x, y) => [x * 15, y * 21, (x + y) * 7, 255]);
    const browserBytes = await renderInBrowser(page, "ios", {
      base64: input.toString("base64"),
      fileName: "parity-image@3x.png",
      targetWidth: 8,
      targetHeight: 5,
    });
    const builderBytes = await transformCatalogImage(input, {
      fileName: "parity-image@3x.png",
      sourceScale: 3,
      width: 12,
      height: 8,
    }, {
      kind: "ios-image",
      outputFormat: "png",
      sourceScale: 3,
      targetScale: 2,
      sourceDimensions: { width: 12, height: 8 },
    });

    await expectSamePixels(browserBytes, builderBytes, 8);
  });
});

async function renderInBrowser(page: Page, kind: keyof BrowserParityApi, payload: BrowserParityPayload) {
  await page.goto("data:text/html,<html><body></body></html>");
  await page.addScriptTag({ content: browserParityScript });
  return Buffer.from(await page.evaluate(async ({ kind: selectedKind, payload: selectedPayload }) => {
    const api = (globalThis as typeof globalThis & { __catalogParity?: BrowserParityApi }).__catalogParity;
    if (!api) throw new Error("catalog_transform_parity_api_missing");
    return api[selectedKind](selectedPayload);
  }, { kind, payload }), "base64");
}

async function expectSamePixels(left: Uint8Array, right: Uint8Array, tolerance = 0) {
  const [leftPixels, rightPixels] = await Promise.all([readPixels(left), readPixels(right)]);
  expect([leftPixels.info.width, leftPixels.info.height]).toEqual([rightPixels.info.width, rightPixels.info.height]);
  expect(leftPixels.data.length).toBe(rightPixels.data.length);

  let maxDifference = 0;
  let totalDifference = 0;
  for (let index = 0; index < leftPixels.data.length; index += 1) {
    const difference = Math.abs(leftPixels.data[index] - rightPixels.data[index]);
    maxDifference = Math.max(maxDifference, difference);
    totalDifference += difference;
  }
  const meanDifference = totalDifference / Math.max(1, leftPixels.data.length);
  expect(maxDifference, `max pixel channel difference: ${maxDifference}`).toBeLessThanOrEqual(tolerance);
  expect(meanDifference, `mean pixel channel difference: ${meanDifference}`).toBeLessThanOrEqual(tolerance / 2);
}

async function readPixels(bytes: Uint8Array) {
  return sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function createRgbaPng(width: number, height: number, colorAt: (x: number, y: number) => [number, number, number, number]) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raw.set(colorAt(x, y), (y * width + x) * 4);
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
