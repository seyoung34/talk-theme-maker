// 랜딩 히어로 목업을 실제 표시 크기에 맞는 WebP로 변환한다 (PERF-001 / SQ-34).
//
// 원본은 808~814px 폭의 PNG 3장(합계 약 3MB)인데 화면에서는 최대 356px로 그려진다.
// 첫 화면 LCP 후보가 1.2MB짜리 PNG라 전송량이 그대로 낭비된다.
//
// 변환 도구로 Chromium(이미 Playwright devDependency로 설치돼 있다)을 쓴다. sharp 같은 네이티브
// 이미지 의존성을 새로 들이지 않기 위해서다. 캔버스로 리사이즈한 뒤 `toBlob("image/webp")`으로 뽑는다.
//
// 실행: node scripts/optimize-landing-images.mjs
// 산출물은 저장소에 커밋한다. 빌드 파이프라인에 넣지 않는다 — 에셋이 바뀔 때만 다시 돌린다.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 원본 PNG는 서빙하지 않는다. `public/`에 두면 참조가 없어도 엣지로 배포된다(3장 합계 약 3MB).
const sourceDir = path.join(projectRoot, "assets", "landing-sources");
const outputDir = path.join(projectRoot, "public", "landing");

const sources = ["couple_mockup.png", "character_mockup.png", "pet_mockup.png"];

// 표시 폭은 데스크톱 356px, 모바일 min(56vw, 232px)이다. 2x DPR을 기준으로 두 벌만 만든다.
// 세 목업의 원본 비율이 미세하게 달라 교체할 때 높이가 흔들렸다. 같은 크기로 맞춰 없앤다.
const variants = [
  { width: 712, height: 1412, suffix: "" },
  { width: 464, height: 920, suffix: "@464" },
];

const webpQuality = 0.86;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const source of sources) {
  const buffer = await readFile(path.join(sourceDir, source));
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  const baseName = source.replace(/\.png$/, "");

  for (const { width, height, suffix } of variants) {
    const encoded = await page.evaluate(
      async ({ dataUrl, width, height, quality }) => {
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("2d context를 얻지 못했습니다.");
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return Array.from(bytes);
      },
      { dataUrl, width, height, quality: webpQuality },
    );

    const output = Buffer.from(encoded);
    const target = path.join(outputDir, `${baseName}${suffix}.webp`);
    await writeFile(target, output);
    const saved = ((1 - output.length / buffer.length) * 100).toFixed(1);
    console.log(
      `${path.basename(target)}  ${width}x${height}  ${(output.length / 1024).toFixed(0)} KB  (원본 ${(buffer.length / 1024).toFixed(0)} KB, -${saved}%)`,
    );
  }
}

await browser.close();
