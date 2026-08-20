/**
 * 3트랙 에셋 저장소 §8.2 — 구운 썸네일 키를 registry에 연결한다.
 *
 * `bake-recommended-asset-thumbnails.mjs`가 만든 manifest를 읽어
 * `theme_asset_objects.r2_previews`에 기록한다. 계약은 아키텍처 문서 §3.2의
 * `r2Previews: Record<presetKey, { objectKey, sha256 }>`다.
 *
 * 저장소도 이미지도 건드리지 않는다. DB의 preview 참조만 채운다.
 *
 * 사용법:
 *   node scripts/catalog-link-preview-keys.mjs --manifest docs/report/recommended-asset-thumbnails-2026-08-19.json
 *   node scripts/catalog-link-preview-keys.mjs --manifest <경로> --apply
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envPath = readFlag("--env") ?? ".env.local";
const manifestPath = readFlag("--manifest");
/** 추천 에셋 피커 타일용 파생물. 갤러리 카드(`card`)와 용도가 달라 키를 나눈다. */
const presetKey = readFlag("--preset") ?? "picker";

if (!manifestPath) {
  console.error("--manifest <썸네일 manifest 경로>가 필요합니다.");
  process.exit(1);
}

const ADMIN_PREFIX = "admin:";
const CANONICAL_VARIANT = "canonical";

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const rows = await selectRows("theme_asset_objects", "id,logical_asset_id,variant_key,r2_previews");
const rowByLogicalId = new Map(rows.filter((row) => row.variant_key === CANONICAL_VARIANT).map((row) => [row.logical_asset_id, row]));

const updates = [];
const unmatched = [];
for (const thumbnail of manifest.thumbnails ?? []) {
  const logicalAssetId = `${ADMIN_PREFIX}${thumbnail.adminAssetId}`;
  const row = rowByLogicalId.get(logicalAssetId);
  if (!row) {
    // registry에 없는 에셋 — PNG가 아니어서 catalog에서 빠졌거나 registry 연결 전이다.
    unmatched.push({ logicalAssetId, objectKey: thumbnail.objectKey });
    continue;
  }
  const existing = row.r2_previews?.[presetKey];
  if (existing?.objectKey === thumbnail.objectKey) continue; // 이미 같은 키다.
  updates.push({
    id: row.id,
    logicalAssetId,
    r2_previews: { ...(row.r2_previews ?? {}), [presetKey]: { objectKey: thumbnail.objectKey, sha256: thumbnail.sha256 } },
  });
}

console.log(`\n=== preview 키 연결 ${apply ? "실행" : "계획"} ===`);
console.log(`  manifest   : ${manifestPath} (썸네일 ${manifest.thumbnails?.length ?? 0}개)`);
console.log(`  preset 키  : ${presetKey}`);
console.log(`  registry   : canonical 행 ${rowByLogicalId.size}개`);
console.log(`\n  갱신 대상  : ${updates.length}`);
console.log(`  이미 최신  : ${(manifest.thumbnails?.length ?? 0) - updates.length - unmatched.length}`);
if (unmatched.length) {
  console.log(`  registry에 없음 : ${unmatched.length}`);
  for (const item of unmatched.slice(0, 5)) console.log(`    ${item.logicalAssetId}`);
}

if (!apply) {
  console.log(`\n계획만 출력했습니다. 실제 갱신은 --apply를 주세요.`);
  process.exit(0);
}

let updated = 0;
const failures = [];
for (const update of updates) {
  const response = await fetch(`${supabaseUrl}/rest/v1/theme_asset_objects?id=eq.${encodeURIComponent(update.id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ r2_previews: update.r2_previews }),
  });
  if (response.ok) {
    updated += 1;
    process.stdout.write(".");
  } else {
    failures.push({ logicalAssetId: update.logicalAssetId, status: response.status, body: (await response.text()).slice(0, 200) });
    process.stdout.write("!");
  }
}

console.log(`\n\n=== 결과 ===`);
console.log(`  갱신 : ${updated}`);
console.log(`  실패 : ${failures.length}`);
for (const failure of failures.slice(0, 8)) console.log(`    ${failure.logicalAssetId} HTTP ${failure.status}: ${failure.body}`);
process.exit(failures.length ? 1 : 0);

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
