/**
 * 3트랙 에셋 저장소 §8.2 — 추천 에셋 피커 썸네일 굽기.
 *
 * `/edit`의 추천 에셋 피커는 지금 **원본 풀사이즈 PNG**를 signed URL로 받아 CSS
 * `background-image`로 쓴다(`adminAssets.ts`의 `getThemeAssetSignedUrls(asset.storagePath)`).
 * 타일은 한 변 100~200px인데 원본은 최대 2MB다. 실측으로 `admin-assets` 원본 67개가 18.76 MiB이고,
 * 같은 화면을 채우는 갤러리 preview 전체(1.18 MiB)의 16배다.
 *
 * 여기서 WebP 썸네일을 만들어 R2에 올린다. 원본은 건드리지 않는다.
 *
 * 변환에 Chromium(Playwright devDependency)을 쓴다 — `scripts/optimize-landing-images.mjs`와 같은
 * 이유로 sharp 같은 네이티브 의존성을 새로 들이지 않는다. 브라우저의 preview 굽기와 같은
 * canvas + `toBlob("image/webp")` 파이프라인이라 결과도 일관된다.
 *
 * 사용법:
 *   node scripts/bake-recommended-asset-thumbnails.mjs                # 계획만
 *   node scripts/bake-recommended-asset-thumbnails.mjs --apply --manifest out.json
 */

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envPath = readFlag("--env") ?? ".env.local";
const manifestPath = readFlag("--manifest");
const bucket = readFlag("--bucket") ?? "talktheme-preview";
/** 타일 긴 변이 100~200px이라 256이면 고해상도 화면에서도 충분하다. */
const maxEdge = Number(readFlag("--max-edge") ?? 256);
const quality = Number(readFlag("--quality") ?? 0.82);
/** 앱의 `lib/theme/assetCatalog/r2Preview.ts`와 같은 값. 키가 불변이라 최대치로 캐시한다. */
const previewCacheControl = "public, max-age=31536000, immutable";

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

const assets = (await selectRows("admin_assets", "id,file_name,mime_type,storage_path,enabled"))
  .filter((row) => typeof row.storage_path === "string" && row.storage_path);

console.log(`\n=== 추천 에셋 썸네일 ${apply ? "굽기" : "계획"} ===`);
console.log(`  대상        : admin_assets ${assets.length}개`);
console.log(`  목표 크기   : 긴 변 ${maxEdge}px WebP (quality ${quality})`);
console.log(`  업로드 대상 : r2://${bucket}/preview/v1/asset/...`);
console.log(`  원본은 그대로 둔다. 이 스크립트는 파생물만 만든다.`);

if (!apply) {
  console.log(`\n계획만 출력했습니다. 실제 실행은 --apply를 주세요.`);
  process.exit(0);
}

const workDir = mkdtempSync(path.join(tmpdir(), "thumb-"));
const browser = await chromium.launch();
const page = await browser.newPage();

const manifest = { generatedAt: new Date().toISOString(), bucket, maxEdge, quality, thumbnails: [], failures: [] };
let originalBytes = 0;
let thumbnailBytes = 0;

try {
  for (const asset of assets) {
    try {
      const source = await downloadObject(asset.storage_path);
      originalBytes += source.byteLength;

      const baked = await bakeThumbnail(page, source, asset.mime_type ?? "image/png");
      thumbnailBytes += baked.byteLength;

      const sha256 = createHash("sha256").update(baked).digest("hex");
      // 용도별 prefix. lib/theme/assetCatalog/r2Preview.ts의 previewObjectKey와 같은 규칙이다.
      const objectKey = `preview/v1/asset/${sha256.slice(0, 2)}/${sha256}.webp`;
      await putR2Object(objectKey, baked);

      manifest.thumbnails.push({
        adminAssetId: asset.id,
        sourcePath: asset.storage_path,
        objectKey,
        sha256,
        sizeBytes: baked.byteLength,
        originalSizeBytes: source.byteLength,
      });
      process.stdout.write(".");
    } catch (error) {
      manifest.failures.push({ adminAssetId: asset.id, path: asset.storage_path, error: String(error?.message ?? error) });
      process.stdout.write("!");
    }
  }
} finally {
  await browser.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n\n=== 결과 ===`);
console.log(`  썸네일 : ${manifest.thumbnails.length}개`);
console.log(`  실패   : ${manifest.failures.length}개`);
for (const failure of manifest.failures.slice(0, 8)) console.log(`    ${failure.path}: ${failure.error}`);
console.log(`\n  원본 합계   : ${mib(originalBytes)}`);
console.log(`  썸네일 합계 : ${mib(thumbnailBytes)}  (${originalBytes ? (100 - (thumbnailBytes / originalBytes) * 100).toFixed(1) : "0"}% 감소)`);

if (manifestPath) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`\nmanifest를 저장했습니다: ${manifestPath}`);
}
process.exit(manifest.failures.length ? 1 : 0);

/**
 * canvas로 축소해 WebP로 뽑는다.
 *
 * 긴 변만 `maxEdge`로 맞추고 비율은 유지한다. 피커가 `bg-cover`(세로형)와 `bg-contain`(정사각)
 * 두 방식을 쓰므로, 특정 비율로 크롭하면 한쪽이 깨진다.
 *
 * 원본보다 크게 만들지 않는다 — 작은 아이콘을 확대해 올리면 용량만 늘고 화질은 그대로다.
 */
async function bakeThumbnail(page, bytes, mimeType) {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const base64 = await page.evaluate(async ({ src, maxEdge, quality }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("이미지 크기를 읽지 못했습니다.");

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas context를 얻지 못했습니다.");
    // 투명 PNG(아이콘·말풍선)가 많아 배경을 칠하지 않는다. WebP는 알파를 보존한다.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) throw new Error("WebP 인코딩에 실패했습니다.");
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const view = new Uint8Array(buffer);
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, { src: dataUrl, maxEdge, quality });

  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * wrangler로 R2에 올린다.
 *
 * 앱은 Worker 바인딩으로 쓰지만 스크립트에는 바인딩이 없다. 일회성 이관이므로 운영자의 wrangler
 * 인증을 쓰고, 이후 정상 경로는 바인딩이 담당한다. 키가 content-addressed라 재실행이 안전하다.
 */
async function putR2Object(objectKey, bytes) {
  const filePath = path.join(workDir, "upload.webp");
  writeFileSync(filePath, bytes);
  // `shell: true`면 셸이 인자를 다시 쪼갠다. `--cache-control` 값에 공백이 있어 인용하지 않으면
  // "Unknown arguments: max-age=31536000,, immutable"로 전부 실패한다.
  execFileSync("npx", [
    "wrangler", "r2", "object", "put", `${bucket}/${objectKey}`,
    "--file", `"${filePath}"`,
    "--content-type", "image/webp",
    "--cache-control", `"${previewCacheControl}"`,
    "--remote",
  ], { stdio: ["ignore", "ignore", "pipe"], shell: true });
}

async function downloadObject(storagePath) {
  const url = `${supabaseUrl}/storage/v1/object/theme-assets/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey } });
  if (!response.ok) throw new Error(`다운로드 실패 HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function selectRows(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`, {
      headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (!response.ok) throw new Error(`${table} 조회 실패: HTTP ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function mib(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MiB`;
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseEnvFile(filePath) {
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}
