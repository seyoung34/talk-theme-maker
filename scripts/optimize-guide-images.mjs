// 가이드 단계 스크린샷을 실제 표시 크기에 맞는 WebP로 변환한다.
//
// 원본은 1900px 폭 안팎의 PNG로 장당 300~400KB다. 가이드 페이지는 이 중 4장만 쓰는데
// 나머지 4장까지 public/에 있어 참조가 없어도 엣지로 배포됐다. 원본은 assets/guide-sources에
// 두고, 참조되는 장면만 public/guide로 굽는다.
//
// 변환 도구는 랜딩 스크립트와 같은 이유로 Chromium(Playwright devDependency)을 쓴다.
// sharp 같은 네이티브 이미지 의존성을 새로 들이지 않기 위해서다.
//
// 실행: node scripts/optimize-guide-images.mjs
// 산출물은 저장소에 커밋한다. 빌드 파이프라인에 넣지 않는다 — 에셋이 바뀔 때만 다시 돌린다.
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "assets", "guide-sources", "android");
const outputDir = path.join(projectRoot, "public", "guide", "android");

// lib/guide/content.ts가 실제로 참조하는 장면만 굽는다. 나머지 원본은 소스 디렉터리에 남긴다.
const sources = ["01-template-gallery.png", "02-edit-background.png", "03-edit-bubble.png", "04-export.png"];

// 카드의 이미지 컬럼은 max-w-7xl 레이아웃에서 최대 700px 정도다. 2x DPR을 감안해 1280px로 굽고,
// 높이는 원본 비율을 유지한다(원본마다 1~2px씩 달라 고정하면 크롭 위치가 흔들린다).
const targetWidth = 1280;
const webpQuality = 0.82;

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const source of sources) {
  const buffer = await readFile(path.join(sourceDir, source));
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  const encoded = await page.evaluate(
    async ({ dataUrl, width, quality }) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const height = Math.round((bitmap.height / bitmap.width) * width);
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2d context를 얻지 못했습니다.");
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), height };
    },
    { dataUrl, width: targetWidth, quality: webpQuality },
  );

  const output = Buffer.from(encoded.bytes);
  const target = path.join(outputDir, source.replace(/\.png$/, ".webp"));
  await writeFile(target, output);
  const saved = ((1 - output.length / buffer.length) * 100).toFixed(1);
  console.log(
    `${path.basename(target)}  ${targetWidth}x${encoded.height}  ${(output.length / 1024).toFixed(0)} KB  (원본 ${(buffer.length / 1024).toFixed(0)} KB, -${saved}%)`,
  );
}

await browser.close();
