/**
 * 3트랙 에셋 저장소 §8.1 — 템플릿 갤러리 preview를 R2로 옮긴다.
 *
 * `theme-public` 버킷의 카드 썸네일과 4화면 preview를 R2 `preview/v1/template/` 아래로 복사하고,
 * 키를 `system_template_variants.preview_metadata.r2`에 기록한다.
 *
 * 이미 WebP로 구워져 있어 **재인코딩하지 않는다.** 바이트를 그대로 옮기므로 화질 변화가 없다.
 * 추천 에셋 썸네일과 달리 굽는 단계가 필요 없어 Chromium도 쓰지 않는다.
 *
 * 기존 `cardPreviewPath`·`screenPreviews`는 지우지 않는다. R2 키가 없거나
 * `NEXT_PUBLIC_R2_PREVIEW_ORIGIN`이 꺼져 있으면 앱이 그쪽으로 떨어진다.
 *
 * 사용법:
 *   node scripts/migrate-template-previews-to-r2.mjs
 *   node scripts/migrate-template-previews-to-r2.mjs --apply
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envPath = readFlag("--env") ?? ".env.local";
const bucket = readFlag("--bucket") ?? "talktheme-preview";
/** 앱의 `lib/theme/assetCatalog/r2Preview.ts`와 같은 값. */
const previewCacheControl = "public, max-age=31536000, immutable";

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

const variants = await selectRows("system_template_variants", "id,preview_metadata");

/** variantId -> { card?: 경로, screens: { screenId: 경로 } } */
const targets = [];
for (const variant of variants) {
  const metadata = variant.preview_metadata ?? {};
  const card = typeof metadata.cardPreviewPath === "string" ? metadata.cardPreviewPath : undefined;
  const screens = Object.entries(metadata.screenPreviews ?? {})
    .filter(([, value]) => typeof value === "string" && value)
    .map(([screenId, storagePath]) => ({ screenId, storagePath }));
  if (card || screens.length) targets.push({ variantId: variant.id, metadata, card, screens });
}

const totalObjects = targets.reduce((sum, target) => sum + (target.card ? 1 : 0) + target.screens.length, 0);

console.log(`\n=== 템플릿 preview R2 이전 ${apply ? "실행" : "계획"} ===`);
console.log(`  variant     : ${targets.length}개`);
console.log(`  옮길 객체   : ${totalObjects}개 (카드 ${targets.filter((t) => t.card).length}, 화면 ${totalObjects - targets.filter((t) => t.card).length})`);
console.log(`  대상        : r2://${bucket}/preview/v1/template/`);
console.log(`  재인코딩하지 않는다. 이미 WebP라 바이트를 그대로 옮긴다.`);
console.log(`  기존 theme-public 객체는 지우지 않는다.`);

if (!apply) {
  console.log(`\n계획만 출력했습니다. 실제 실행은 --apply를 주세요.`);
  process.exit(0);
}

const workDir = mkdtempSync(path.join(tmpdir(), "tplprev-"));
let copied = 0;
let reused = 0;
const failures = [];
/** sha256 -> objectKey. 같은 바이트를 두 번 올리지 않는다. */
const uploadedBySha = new Map();

try {
  for (const target of targets) {
    const r2 = { ...(target.metadata.r2 ?? {}) };
    try {
      if (target.card) {
        r2.card = await copyOne(target.card);
      }
      if (target.screens.length) {
        const screens = { ...(r2.screens ?? {}) };
        for (const screen of target.screens) screens[screen.screenId] = await copyOne(screen.storagePath);
        r2.screens = screens;
      }
      await patchPreviewMetadata(target.variantId, { ...target.metadata, r2 });
      process.stdout.write(".");
    } catch (error) {
      failures.push({ variantId: target.variantId, error: String(error?.message ?? error).slice(0, 160) });
      process.stdout.write("!");
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n\n=== 결과 ===`);
console.log(`  업로드     : ${copied}개`);
console.log(`  중복 재사용: ${reused}개 (같은 바이트)`);
console.log(`  실패       : ${failures.length}개`);
for (const failure of failures.slice(0, 8)) console.log(`    ${failure.variantId}: ${failure.error}`);
process.exit(failures.length ? 1 : 0);

async function copyOne(storagePath) {
  const bytes = await downloadPublicObject(storagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = uploadedBySha.get(sha256);
  if (existing) {
    reused += 1;
    return { objectKey: existing, sha256 };
  }

  const extension = storagePath.toLowerCase().endsWith(".png") ? "png" : "webp";
  // 용도별 prefix. lib/theme/assetCatalog/r2Preview.ts의 previewObjectKey와 같은 규칙이다.
  const objectKey = `preview/v1/template/${sha256.slice(0, 2)}/${sha256}.${extension}`;
  putR2Object(objectKey, bytes, extension === "png" ? "image/png" : "image/webp");
  uploadedBySha.set(sha256, objectKey);
  copied += 1;
  return { objectKey, sha256 };
}

/** `theme-public`은 공개 버킷이라 서명이 필요 없다. */
async function downloadPublicObject(storagePath) {
  const url = `${supabaseUrl}/storage/v1/object/public/theme-public/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`다운로드 실패 HTTP ${response.status}: ${storagePath}`);
  return new Uint8Array(await response.arrayBuffer());
}

function putR2Object(objectKey, bytes, contentType) {
  const filePath = path.join(workDir, "upload.bin");
  writeFileSync(filePath, bytes);
  // `shell: true`면 셸이 인자를 다시 쪼갠다. 공백이 있는 값은 인용해야 한다.
  execFileSync("npx", [
    "wrangler", "r2", "object", "put", `${bucket}/${objectKey}`,
    "--file", `"${filePath}"`,
    "--content-type", contentType,
    "--cache-control", `"${previewCacheControl}"`,
    "--remote",
  ], { stdio: ["ignore", "ignore", "pipe"], shell: true });
}

async function patchPreviewMetadata(variantId, metadata) {
  const response = await fetch(`${supabaseUrl}/rest/v1/system_template_variants?id=eq.${encodeURIComponent(variantId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ preview_metadata: metadata }),
  });
  if (!response.ok) throw new Error(`metadata 갱신 실패 HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
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
