/**
 * 3트랙 에셋 저장소 Phase 2 §7.2 — registry 연결.
 *
 * backfill이 GCS로 옮긴 객체를 `theme_asset_objects` 행으로 등록한다.
 * catalog manifest(=업로드 결과)와 DB 참조를 대조해 만들며, **Storage는 건드리지 않는다.**
 *
 * 논리 자산 id는 출처별로 네임스페이스를 나눈다(`admin:` / `tpl:`).
 * 근거는 `lib/theme/assetCatalog/logicalAssetId.ts` 주석 참고 — 편집기가 추천 에셋의 업로드 항목 id를
 * `admin_assets.id`로 그대로 넣기 때문에, 접두가 없으면 둘이 한 행으로 합쳐지고 관리자 갱신이
 * 템플릿까지 전파된다.
 *
 * 사용법:
 *   node scripts/catalog-registry-link.mjs --manifest docs/report/catalog-backfill-manifest-2026-08-19.json
 *   node scripts/catalog-registry-link.mjs --manifest <경로> --apply
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envPath = readFlag("--env") ?? ".env.local";
const manifestPath = readFlag("--manifest");
if (!manifestPath) {
  console.error("--manifest <catalog-backfill manifest 경로>가 필요합니다.");
  process.exit(1);
}

// 접두와 variant 키는 앱과 같은 값을 써야 한다. 스크립트는 TS를 import할 수 없어 값만 복제하고,
// 어긋나면 registry가 앱이 못 읽는 행을 갖게 되므로 lib 쪽 상수를 단일 출처로 본다.
const ADMIN_PREFIX = "admin:";
const TEMPLATE_PREFIX = "tpl:";
const CANONICAL_VARIANT = "canonical";

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const catalogByPath = new Map();
for (const entry of manifest.catalog) {
  for (const path of entry.sourcePaths) catalogByPath.set(path, entry);
}

const [admins, variants] = await Promise.all([
  selectRows("admin_assets", "id,platform,file_name,storage_path"),
  selectRows("system_template_variants", "id,platform,upload_refs"),
]);

/** logicalAssetId -> { catalogEntry, fileName, sources[] } */
const logicalAssets = new Map();
const conflicts = [];
const unmapped = [];

for (const admin of admins) {
  addLogical(`${ADMIN_PREFIX}${admin.id}`, admin.storage_path, admin.file_name, `admin_assets/${admin.id}`);
}
for (const variant of variants) {
  for (const [slotId, entries] of Object.entries(variant.upload_refs ?? {})) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      addLogical(`${TEMPLATE_PREFIX}${entry.id}`, entry.storagePath, entry.fileName, `${variant.id}/${slotId}`);
    }
  }
}

function addLogical(logicalAssetId, storagePath, fileName, source) {
  const catalogEntry = catalogByPath.get(storagePath);
  if (!catalogEntry) {
    // catalog에 없는 경로 — PNG가 아니어서 제외됐거나 manifest가 오래됐다.
    unmapped.push({ logicalAssetId, storagePath, source });
    return;
  }
  const existing = logicalAssets.get(logicalAssetId);
  if (!existing) {
    logicalAssets.set(logicalAssetId, { catalogEntry, fileName, sources: [source] });
    return;
  }
  existing.sources.push(source);
  // 같은 논리 자산이 서로 다른 내용을 가리키면 (logical, revision, variant) 유일 제약과 충돌한다.
  if (existing.catalogEntry.sha256 !== catalogEntry.sha256) {
    conflicts.push({ logicalAssetId, expected: existing.catalogEntry.sha256, found: catalogEntry.sha256, storagePath });
  }
}

/**
 * width/height는 GCS 객체의 **헤더 24바이트만** Range로 읽어 채운다.
 *
 * registry는 이 두 값을 NOT NULL·양수로 요구한다. export가 바이트를 내려받지 않고 iOS cap-inset을
 * 계산하는 근거이므로 추정값을 넣을 수 없다. PNG는 IHDR이 첫 청크라 앞 24바이트면 충분하고,
 * 이미 GCS에 있으므로 Supabase egress도 발생하지 않는다.
 */
const headerByObjectKey = await readCatalogPngHeaders([...new Set([...logicalAssets.values()].map((value) => value.catalogEntry.objectKey))]);

const rows = [];
const headerFailures = [];
for (const [logicalAssetId, value] of logicalAssets) {
  const header = headerByObjectKey.get(value.catalogEntry.objectKey);
  if (!header) {
    headerFailures.push({ logicalAssetId, objectKey: value.catalogEntry.objectKey });
    continue;
  }
  rows.push({
    logical_asset_id: logicalAssetId,
    revision: 1,
    variant_key: CANONICAL_VARIANT,
    status: "active",
    gcs_object_key: value.catalogEntry.objectKey,
    gcs_generation: value.catalogEntry.generation,
    sha256: value.catalogEntry.sha256,
    size_bytes: value.catalogEntry.sizeBytes,
    mime_type: "image/png",
    file_name: value.fileName,
    source_scale: detectSourceScale(value.fileName) ?? 3,
    width: header.width,
    height: header.height,
    png_signature_verified: true,
    png_signature_verified_at: new Date().toISOString(),
    activated_at: new Date().toISOString(),
  });
}

printPlan();

if (conflicts.length) {
  console.error(`\n충돌이 있어 진행하지 않습니다. 같은 논리 자산이 서로 다른 내용을 가리킵니다.`);
  process.exit(2);
}

if (!apply) {
  console.log(`\n계획만 출력했습니다. 실제 삽입은 --apply를 주세요.`);
  process.exit(0);
}

console.log(`\n[삽입] ${rows.length}행`);
let inserted = 0;
let skipped = 0;
const failures = [];
for (const batch of chunk(rows, 50)) {
  const response = await fetch(`${supabaseUrl}/rest/v1/theme_asset_objects?on_conflict=logical_asset_id,revision,variant_key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      apikey: secretKey,
      "Content-Type": "application/json",
      // 재실행이 안전해야 한다. 이미 있는 (logical, revision, variant)는 건드리지 않고 넘어간다.
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(batch),
  });
  if (!response.ok) {
    failures.push({ size: batch.length, status: response.status, body: (await response.text()).slice(0, 300) });
    process.stdout.write("!");
    continue;
  }
  const returned = await response.json();
  inserted += returned.length;
  skipped += batch.length - returned.length;
  process.stdout.write(".");
}

console.log(`\n\n=== 결과 ===`);
console.log(`  삽입   : ${inserted}`);
console.log(`  건너뜀 : ${skipped} (이미 존재)`);
console.log(`  실패   : ${failures.length}건`);
for (const failure of failures) console.log(`    HTTP ${failure.status}: ${failure.body}`);
process.exit(failures.length ? 1 : 0);

function printPlan() {
  console.log(`\n=== registry 연결 ${apply ? "실행" : "계획"} ===`);
  console.log(`  manifest : ${manifestPath} (catalog ${manifest.catalog.length}개)`);
  const admin = rows.filter((row) => row.logical_asset_id.startsWith(ADMIN_PREFIX)).length;
  console.log(`\n[논리 자산] ${rows.length}개`);
  console.log(`  ${ADMIN_PREFIX.padEnd(8)} 추천 에셋        : ${admin}`);
  console.log(`  ${TEMPLATE_PREFIX.padEnd(8)} 템플릿 업로드    : ${rows.length - admin}`);
  console.log(`  가리키는 GCS 객체              : ${new Set(rows.map((row) => row.gcs_object_key)).size}개`);

  const shared = [...logicalAssets.values()].filter((value) => value.sources.length > 1);
  console.log(`  2곳 이상에서 참조되는 논리 자산 : ${shared.length}`);

  if (unmapped.length) {
    console.log(`\n[catalog에 없는 참조] ${unmapped.length}건 — registry에 넣지 않는다`);
    for (const item of unmapped.slice(0, 5)) console.log(`  ${item.logicalAssetId}  ${item.storagePath}`);
  }
  if (conflicts.length) {
    console.log(`\n[충돌] ${conflicts.length}건`);
    for (const item of conflicts.slice(0, 8)) console.log(`  ${item.logicalAssetId}: ${item.expected.slice(0, 8)} != ${item.found.slice(0, 8)}  (${item.storagePath})`);
  }

  if (headerFailures.length) {
    console.log(`\n[헤더 읽기 실패] ${headerFailures.length}건 — 해당 논리 자산은 registry에 넣지 않는다`);
    for (const item of headerFailures.slice(0, 5)) console.log(`  ${item.logicalAssetId}  ${item.objectKey}`);
  }
  console.log(`\n[width/height] GCS 객체 헤더 24바이트를 Range로 읽어 실측값을 넣는다.`);
  console.log(`  registry가 NOT NULL·양수를 요구하고, export가 바이트 없이 iOS cap-inset을 계산하는`);
  console.log(`  근거라 추정값을 넣을 수 없다. Supabase egress는 발생하지 않는다.`);
}

/** PNG 헤더 24바이트만 Range로 읽어 IHDR의 width/height를 얻는다. `lib/theme/assetCatalog/pngSource.ts`와 같은 규칙. */
async function readCatalogPngHeaders(objectKeys) {
  const bucket = env.GCP_THEME_ASSET_BUCKET;
  if (!bucket) throw new Error(".env.local에 GCP_THEME_ASSET_BUCKET이 필요합니다.");
  const accessToken = readGcloudAccessToken();
  const headers = new Map();

  for (const objectKey of objectKeys) {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}?alt=media`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Range: "bytes=0-23" } });
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const metadata = parsePngHeader(bytes);
    if (metadata) headers.set(objectKey, metadata);
  }
  return headers;
}

function parsePngHeader(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 첫 청크는 반드시 길이 13의 IHDR이다.
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readGcloudAccessToken() {
  const injected = process.env.GCLOUD_ACCESS_TOKEN?.trim();
  if (injected) return injected;
  const candidates = [
    process.env.GCLOUD_PATH,
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd`,
    "gcloud",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      // Windows 기본 설치 경로에 공백이 있어 shell 실행 시 인용이 필요하다.
      const command = candidate.includes(" ") ? `"${candidate}"` : candidate;
      const token = execFileSync(command, ["auth", "print-access-token"], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (token) return token;
    } catch {
      // 다음 후보로 넘어간다.
    }
  }
  throw new Error("gcloud 액세스 토큰을 얻지 못했습니다. `gcloud auth login` 후 다시 실행하거나 GCLOUD_ACCESS_TOKEN을 지정하세요.");
}

function detectSourceScale(fileName) {
  const match = String(fileName ?? "").match(/@([23])x(?=\.[a-z0-9]+$|$)/i);
  return match ? Number(match[1]) : null;
}

async function selectRows(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`, {
      headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`${table} 조회 실패: HTTP ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}
