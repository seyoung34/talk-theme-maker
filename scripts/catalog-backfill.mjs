/**
 * 3트랙 에셋 저장소 Phase 2 §7.2 — backfill 실행.
 *
 * `theme-assets`의 원본을 GCS catalog로 옮기고, 고아 객체는 격리 prefix로 백업한다.
 * **아무것도 삭제하지 않는다.** Supabase legacy 경로는 그대로 남는다.
 *
 * 기본은 계획 출력이다. 실제 전송은 `--apply`를 줘야 한다.
 *
 * 사용법:
 *   node scripts/catalog-backfill.mjs                       # 계획만
 *   node scripts/catalog-backfill.mjs --apply --manifest m.json
 *
 * 인증:
 *   Supabase 읽기  — .env.local의 SUPABASE_SECRET_KEY
 *   GCS 쓰기       — `gcloud auth print-access-token` (운영자 신원)
 *
 * publisher SA를 쓰지 않는 이유: 그 신원은 Cloudflare Worker의 OIDC impersonation으로만 얻을 수 있고
 * 로컬에는 서명 키가 없다. 일회성 이관이므로 운영자 신원으로 수행하고, 이후 정상 publish는
 * `theme-catalog-publisher`가 담당한다.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envPath = readFlag("--env") ?? ".env.local";
const manifestPath = readFlag("--manifest");
const quarantineDate = readFlag("--quarantine-date") ?? new Date().toISOString().slice(0, 10);
const concurrency = Number(readFlag("--concurrency") ?? 4);

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
const catalogBucket = env.GCP_THEME_ASSET_BUCKET;
if (!supabaseUrl || !secretKey || !catalogBucket) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, GCP_THEME_ASSET_BUCKET이 필요합니다.`);
  process.exit(1);
}

const storageObjects = await listBucket("theme-assets");
const referencedPaths = await collectReferencedPaths();

const referenced = storageObjects.filter((object) => referencedPaths.has(object.path));
const orphans = storageObjects.filter((object) => !referencedPaths.has(object.path));

// 같은 내용은 한 번만 옮긴다. eTag로 미리 묶어 다운로드 횟수를 줄이고, SHA-256은 실제로 받은
// 바이트에서 계산해 최종 확인한다.
const referencedGroups = groupByContent(referenced);
const catalogGroups = referencedGroups.filter((group) => group.mimeType === "image/png");
const unsupportedGroups = referencedGroups.filter((group) => group.mimeType !== "image/png");

printPlan();

if (!apply) {
  console.log(`\n계획만 출력했습니다. 실제 전송은 --apply를 주세요.`);
  process.exit(0);
}

const accessToken = readGcloudAccessToken();
const manifest = { generatedAt: new Date().toISOString(), catalogBucket, quarantineDate, catalog: [], quarantine: [], failures: [] };

console.log(`\n[1/2] catalog 업로드 ${catalogGroups.length}개`);
await runWithConcurrency(catalogGroups, concurrency, async (group) => {
  try {
    const bytes = await downloadObject(group.representative.path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== group.sizeBytes) throw new Error(`크기 불일치: ${bytes.byteLength} != ${group.sizeBytes}`);
    const objectKey = `catalog/v1/${sha256.slice(0, 2)}/${sha256}.png`;
    const uploaded = await uploadToGcs(objectKey, bytes, "image/png");
    manifest.catalog.push({
      objectKey,
      sha256,
      sizeBytes: bytes.byteLength,
      generation: uploaded.generation,
      created: uploaded.created,
      sourcePaths: group.paths,
    });
    process.stdout.write(uploaded.created ? "." : "=");
  } catch (error) {
    manifest.failures.push({ stage: "catalog", path: group.representative.path, error: String(error?.message ?? error) });
    process.stdout.write("!");
  }
});

console.log(`\n[2/2] 고아 격리 ${orphans.length}개`);
await runWithConcurrency(orphans, concurrency, async (object) => {
  try {
    const bytes = await downloadObject(object.path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // 원래 경로를 그대로 보존한다. 복원할 때 어디로 되돌릴지가 곧 이 경로다.
    const objectKey = `quarantine/${quarantineDate}/theme-assets/${object.path}`;
    const uploaded = await uploadToGcs(objectKey, bytes, object.mimeType);
    manifest.quarantine.push({ objectKey, sha256, sizeBytes: bytes.byteLength, generation: uploaded.generation, sourcePath: object.path });
    process.stdout.write(uploaded.created ? "." : "=");
  } catch (error) {
    manifest.failures.push({ stage: "quarantine", path: object.path, error: String(error?.message ?? error) });
    process.stdout.write("!");
  }
});

console.log(`\n\n=== 결과 ===`);
console.log(`  catalog   : ${manifest.catalog.length}개 / ${mib(sum(manifest.catalog, (e) => e.sizeBytes))}`);
console.log(`  격리      : ${manifest.quarantine.length}개 / ${mib(sum(manifest.quarantine, (e) => e.sizeBytes))}`);
console.log(`  실패      : ${manifest.failures.length}개`);
for (const failure of manifest.failures.slice(0, 10)) console.log(`    ${failure.stage} ${failure.path}: ${failure.error}`);

if (manifestPath) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`\nhash manifest를 저장했습니다: ${manifestPath}`);
  console.log(`이 파일은 legacy 객체 삭제 승인의 전제 조건이다. 보관하지 않으면 삭제하지 않는다.`);
}

// 실패가 남으면 재실행이 필요하다. content-addressed라 여러 번 돌려도 안전하다.
process.exit(manifest.failures.length ? 1 : 0);

function printPlan() {
  console.log(`\n=== catalog backfill ${apply ? "실행" : "계획"} ===`);
  console.log(`  대상 버킷 : gs://${catalogBucket}`);
  console.log(`\n[저장소] 객체 ${storageObjects.length}개 / ${mib(sum(storageObjects, (o) => o.size))}`);
  console.log(`  참조됨 ${referenced.length}개 / 고아 ${orphans.length}개`);
  console.log(`\n[catalog 이관] 고유 내용 ${catalogGroups.length}개 / ${mib(sum(catalogGroups, (g) => g.sizeBytes))}`);
  console.log(`  다운로드는 그룹당 1회다. ${referenced.length}개가 아니라 ${catalogGroups.length}개만 받는다.`);

  if (unsupportedGroups.length) {
    console.log(`\n[결정 필요] PNG가 아닌 참조 객체 ${unsupportedGroups.length}개 — catalog로 옮기지 않는다`);
    for (const group of unsupportedGroups) {
      console.log(`  ${group.mimeType.padEnd(12)} ${mib(group.sizeBytes).padStart(10)}  ${group.representative.path}`);
    }
    console.log(`  catalog는 export 원본 저장소라 PNG만 받는다(publish.ts describeCatalogSource).`);
    console.log(`  이 객체들은 legacy Supabase 경로에 남고, 해당 슬롯은 기존 field 업로드 경로를 계속 쓴다.`);
  }

  console.log(`\n[고아 격리] ${orphans.length}개 / ${mib(sum(orphans, (o) => o.size))} → gs://${catalogBucket}/quarantine/${quarantineDate}/`);
  console.log(`  Supabase Storage에는 soft delete가 없어 삭제 전 백업이 필요하다. 이 스크립트는 삭제하지 않는다.`);

  const downloadBytes = sum(catalogGroups, (g) => g.sizeBytes) + sum(orphans, (o) => o.size);
  console.log(`\n[예상 egress] 약 ${mib(downloadBytes)} (Supabase → 로컬)`);
}

function groupByContent(objects) {
  const groups = new Map();
  for (const object of objects) {
    const key = `${object.etag}:${object.size}`;
    if (!groups.has(key)) groups.set(key, { representative: object, sizeBytes: object.size, mimeType: object.mimeType, paths: [] });
    groups.get(key).paths.push(object.path);
  }
  return [...groups.values()];
}

async function downloadObject(path) {
  const url = `${supabaseUrl}/storage/v1/object/theme-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey } });
  if (!response.ok) throw new Error(`다운로드 실패 HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * `ifGenerationMatch=0`은 "없을 때만 생성"이다. 412는 오류가 아니라 이미 같은 내용이 있다는 뜻이라
 * 재실행이 안전하다. 앱의 `putCatalogObject()`와 같은 규칙을 쓴다.
 */
async function uploadToGcs(objectKey, bytes, contentType) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(catalogBucket)}/o`
    + `?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(objectKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes,
  });

  if (response.status === 412) {
    const head = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(catalogBucket)}/o/${encodeURIComponent(objectKey)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!head.ok) throw new Error(`이미 존재하지만 조회 실패 HTTP ${head.status}`);
    const existing = await head.json();
    if (Number(existing.size) !== bytes.byteLength) throw new Error(`기존 객체 크기 불일치: ${existing.size} != ${bytes.byteLength}`);
    return { generation: existing.generation, created: false };
  }
  if (!response.ok) throw new Error(`업로드 실패 HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const result = await response.json();
  if (Number(result.size) !== bytes.byteLength) throw new Error(`업로드 크기 불일치: ${result.size} != ${bytes.byteLength}`);
  return { generation: result.generation, created: true };
}

function readGcloudAccessToken() {
  // CI나 셸 차이를 피하고 싶을 때 토큰을 직접 넘길 수 있게 둔다.
  const injected = process.env.GCLOUD_ACCESS_TOKEN?.trim();
  if (injected) return injected;

  const candidates = [
    process.env.GCLOUD_PATH,
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd`,
    "gcloud",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      // Windows 기본 설치 경로에 공백("Cloud SDK")이 있어 shell 실행 시 인용이 필요하다.
      const command = candidate.includes(" ") ? `"${candidate}"` : candidate;
      const token = execFileSync(command, ["auth", "print-access-token"], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (token) return token;
    } catch {
      // 다음 후보로 넘어간다.
    }
  }
  throw new Error("gcloud 액세스 토큰을 얻지 못했습니다. `gcloud auth login` 후 다시 실행하거나 GCLOUD_ACCESS_TOKEN을 지정하세요.");
}

async function runWithConcurrency(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await task(next);
  });
  await Promise.all(workers);
}

async function collectReferencedPaths() {
  const paths = new Set();
  const add = (value) => { if (typeof value === "string" && value) paths.add(value); };

  for (const table of ["admin_assets", "admin_asset_variants", "admin_asset_bubble_decorations"]) {
    for (const row of await selectRows(table, "storage_path")) add(row.storage_path);
  }
  for (const row of await selectRows("system_template_variants", "upload_refs,preview_metadata")) {
    for (const entries of Object.values(row.upload_refs ?? {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        add(entry?.storagePath);
        add(entry?.imageEdit?.originalStoragePath);
      }
    }
    // cardPreviewPath와 screenPreviews는 theme-public 버킷이라 세지 않는다.
    for (const value of Object.values(row.preview_metadata?.refs ?? {})) add(value);
  }
  return paths;
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

async function listBucket(bucket) {
  const files = [];
  await walk("");
  return files;

  async function walk(prefix, depth = 0) {
    if (depth > 6) return;
    for (let offset = 0; ; offset += 100) {
      const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`${bucket} 목록 조회 실패: HTTP ${response.status}`);
      const rows = await response.json();
      for (const row of rows) {
        if (row.id === null) await walk(`${prefix}${row.name}/`, depth + 1);
        else {
          files.push({
            path: prefix + row.name,
            size: row.metadata?.size ?? 0,
            mimeType: row.metadata?.mimetype ?? "application/octet-stream",
            etag: String(row.metadata?.eTag ?? "").replaceAll('"', "") || `no-etag:${prefix}${row.name}`,
          });
        }
      }
      if (rows.length < 100) return;
    }
  }
}

function sum(items, valueOf) {
  return items.reduce((total, item) => total + valueOf(item), 0);
}

function mib(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MiB`;
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
