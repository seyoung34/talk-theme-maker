/**
 * 3트랙 에셋 저장소 Phase 2 §7.2 — backfill dry-run.
 *
 * `theme-assets` 버킷과 DB 참조를 대조해 누락·고아·중복을 보고한다. 아무것도 쓰지 않는다.
 *
 * 객체를 내려받지 않는다. Supabase storage list가 돌려주는 `eTag`(비-멀티파트 업로드의 MD5)로
 * 중복을 판정하므로 egress가 0이다. 실제 backfill은 content-addressed 키에 SHA-256이 필요해
 * 그때는 내려받아야 하지만, 무엇을 옮길지 정하는 이 단계에는 필요 없다.
 *
 * 사용법:
 *   node scripts/catalog-backfill-dry-run.mjs [--env .env.local] [--json <경로>]
 */

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const envPath = readFlag("--env") ?? ".env.local";
const jsonPath = readFlag("--json");

const env = parseEnvFile(envPath);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

const storageObjects = await listBucket("theme-assets");
const { paths: referencedPaths, counts: referenceCounts, scanned: scannedRowCounts } = await collectReferencedPaths();
const liveVariantIds = new Set((await selectRows("system_template_variants", "id")).map((row) => row.id));

const objectByPath = new Map(storageObjects.map((object) => [object.path, object]));
const orphans = storageObjects.filter((object) => !referencedPaths.has(object.path));
const missing = [...referencedPaths].filter((path) => !objectByPath.has(path)).sort();

// eTag가 곧 내용 해시다. 크기까지 같이 묶어 서로 다른 파일이 우연히 같은 그룹에 들어가지 않게 한다.
const groups = new Map();
for (const object of storageObjects) {
  const key = `${object.etag}:${object.size}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(object);
}

const totalBytes = sumBytes(storageObjects);
const uniqueBytes = [...groups.values()].reduce((sum, group) => sum + group[0].size, 0);
const redundantObjects = storageObjects.length - groups.size;
const redundantBytes = totalBytes - uniqueBytes;

const duplicateGroups = [...groups.values()]
  .filter((group) => group.length > 1)
  .map((group) => ({
    copies: group.length,
    sizeBytes: group[0].size,
    wastedBytes: group[0].size * (group.length - 1),
    paths: group.map((object) => object.path),
  }))
  .sort((a, b) => b.wastedBytes - a.wastedBytes);

const report = {
  generatedAt: new Date().toISOString(),
  bucket: "theme-assets",
  storage: {
    objectCount: storageObjects.length,
    totalBytes,
    byMimeType: countBy(storageObjects, (object) => object.mimeType),
  },
  references: {
    total: referencedPaths.size,
    bySource: referenceCounts,
    // 고아 판정은 "참조를 빠짐없이 모았다"는 전제 위에 선다. 스캔한 행 수를 같이 남겨야
    // 나중에 표가 비어 있던 것인지 조회를 빠뜨린 것인지 구분할 수 있다.
    tablesScanned: scannedRowCounts,
  },
  reconciliation: {
    referencedObjects: storageObjects.length - orphans.length,
    orphanObjects: orphans.length,
    orphanBytes: sumBytes(orphans),
    missingReferences: missing.length,
  },
  deduplication: {
    uniqueObjects: groups.size,
    uniqueBytes,
    redundantObjects,
    redundantBytes,
    redundantRatio: totalBytes ? redundantBytes / totalBytes : 0,
    copyHistogram: countBy([...groups.values()], (group) => String(group.length)),
  },
  catalogProjection: {
    objectsToUpload: groups.size,
    bytesToUpload: uniqueBytes,
    note: "실제 backfill은 SHA-256 재계산이 필요해 원본을 한 번씩 내려받는다.",
  },
  duplicateGroups: duplicateGroups.slice(0, 20),
  // 고아가 한 prefix에 몰려 있으면 개별 사고가 아니라 삭제된 템플릿의 잔재일 가능성이 높다.
  orphansByPrefix: countBy(orphans, (object) => object.path.split("/").slice(0, 2).join("/")),
  orphansByReason: countBy(orphans, orphanReason),
  orphans: orphans.map((object) => ({ path: object.path, sizeBytes: object.size })).sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 50),
  missingReferences: missing.slice(0, 50),
};

printReport(report);
if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nJSON 스냅샷을 저장했습니다: ${jsonPath}`);
}

// 고아나 누락은 backfill 설계를 바꾸는 신호라 종료 코드로 드러낸다.
process.exit(orphans.length || missing.length ? 2 : 0);

function printReport(data) {
  const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;
  console.log(`\n=== theme-assets backfill dry-run (${data.generatedAt}) ===`);
  console.log(`\n[저장소] 객체 ${data.storage.objectCount}개 / ${mib(data.storage.totalBytes)}`);
  for (const [mime, count] of Object.entries(data.storage.byMimeType)) console.log(`  ${mime}: ${count}`);

  console.log(`\n[DB 참조] 고유 경로 ${data.references.total}개`);
  for (const [table, rows] of Object.entries(data.references.tablesScanned)) {
    console.log(`  ${table.padEnd(36)} 행 ${String(rows).padStart(4)}`);
  }
  console.log(`  참조원별:`);
  for (const [source, count] of Object.entries(data.references.bySource)) {
    console.log(`    ${source.padEnd(44)} ${count}`);
  }

  console.log(`\n[대조]`);
  console.log(`  참조되는 객체 : ${data.reconciliation.referencedObjects}`);
  console.log(`  고아 객체     : ${data.reconciliation.orphanObjects} (${mib(data.reconciliation.orphanBytes)})`);
  console.log(`  누락 참조     : ${data.reconciliation.missingReferences}`);

  const dedup = data.deduplication;
  console.log(`\n[중복 — eTag 기준 실측]`);
  console.log(`  고유 객체 : ${dedup.uniqueObjects}개 / ${mib(dedup.uniqueBytes)}`);
  console.log(`  잉여 객체 : ${dedup.redundantObjects}개 / ${mib(dedup.redundantBytes)} (${(dedup.redundantRatio * 100).toFixed(1)}%)`);
  console.log(`  사본 분포 : ${Object.entries(dedup.copyHistogram).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}본:${v}`).join("  ")}`);

  if (data.duplicateGroups.length) {
    console.log(`\n[중복 상위]`);
    for (const group of data.duplicateGroups.slice(0, 8)) {
      console.log(`  ${(group.sizeBytes / 1024).toFixed(0).padStart(6)} KiB x ${group.copies}본 = ${mib(group.wastedBytes)} 잉여`);
      console.log(`      ${group.paths[0]}`);
    }
  }

  if (data.orphans.length) {
    console.log(`\n[고아 객체 — DB가 참조하지 않음] 원인별`);
    for (const [reason, count] of Object.entries(data.orphansByReason).sort((a, b) => b[1] - a[1])) {
      const label = reason === "deleted-owner" ? "소유 variant 삭제됨 (삭제 경로 결함)"
        : reason === "replaced-upload" ? "교체된 이전 업로드"
        : reason;
      console.log(`  ${String(count).padStart(4)}개  ${label}`);
    }
    console.log(`\n  prefix별 분포`);
    for (const [prefix, count] of Object.entries(data.orphansByPrefix).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}개  ${prefix}/`);
    }
    console.log(`  상위 5개:`);
    for (const orphan of data.orphans.slice(0, 5)) console.log(`    ${(orphan.sizeBytes / 1024).toFixed(0).padStart(6)} KiB  ${orphan.path}`);
  }

  if (data.missingReferences.length) {
    console.log(`\n[누락 — DB는 참조하는데 객체가 없음]`);
    for (const path of data.missingReferences.slice(0, 10)) console.log(`  ${path}`);
    if (data.reconciliation.missingReferences > 10) console.log(`  ... 외 ${data.reconciliation.missingReferences - 10}개`);
  }

  console.log(`\n[GCS catalog 예상] 업로드 ${data.catalogProjection.objectsToUpload}개 / ${mib(data.catalogProjection.bytesToUpload)}`);
  console.log(`  ${data.catalogProjection.note}`);
}

async function collectReferencedPaths() {
  const paths = new Set();
  const counts = {};
  const scanned = {};

  const add = (source, value) => {
    if (typeof value !== "string" || !value) return;
    paths.add(value);
    counts[source] = (counts[source] ?? 0) + 1;
  };

  for (const table of ["admin_assets", "admin_asset_variants", "admin_asset_bubble_decorations"]) {
    const rows = await selectRows(table, "storage_path");
    scanned[table] = rows.length;
    for (const row of rows) add(table, row.storage_path);
  }

  // system template의 참조는 jsonb 두 곳에 나뉘어 있다.
  const variantRows = await selectRows("system_template_variants", "upload_refs,preview_metadata");
  scanned.system_template_variants = variantRows.length;
  for (const row of variantRows) {
    // 1) upload_refs — 슬롯별 배열이라 두 겹을 편다.
    for (const entries of Object.values(row.upload_refs ?? {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        add("system_template_variants.upload_refs", entry?.storagePath);
        add("system_template_variants.upload_refs", entry?.imageEdit?.originalStoragePath);
      }
    }

    /**
     * 2) preview_metadata.refs — 갤러리 카드를 그릴 때 쓰는 원본 참조다.
     *
     * `theme-assets` 경로를 담는다. 같은 컬럼의 `cardPreviewPath`와 `screenPreviews`는
     * `theme-public` 버킷이라 여기서 세지 않는다. 버킷이 다른데 경로 문자열이 비슷해
     * 섞기 쉬우므로 refs만 명시적으로 집는다.
     */
    for (const value of Object.values(row.preview_metadata?.refs ?? {})) {
      add("system_template_variants.preview_metadata.refs", value);
    }
  }

  return { paths, counts, scanned };
}

async function selectRows(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        apikey: secretKey,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (response.status === 404) {
      console.warn(`  (경고) 테이블 ${table}을 찾지 못했습니다. 참조 대조에서 제외합니다.`);
      return [];
    }
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
        // id가 null이면 디렉터리 자리표시자다.
        if (row.id === null) await walk(`${prefix}${row.name}/`, depth + 1);
        else {
          files.push({
            path: prefix + row.name,
            size: row.metadata?.size ?? 0,
            mimeType: row.metadata?.mimetype ?? "unknown",
            etag: String(row.metadata?.eTag ?? "").replaceAll('"', "") || `no-etag:${prefix}${row.name}`,
          });
        }
      }
      if (rows.length < 100) return;
    }
  }
}

/**
 * 고아가 생긴 이유를 나눈다. 조치가 다르기 때문이다.
 *
 * - `deleted-owner`: 소유 variant가 DB에 없다. 삭제 시 객체를 함께 지우지 않은 잔재다.
 * - `replaced-upload`: variant는 살아 있는데 더는 이 객체를 참조하지 않는다. 교체된 이전 업로드다.
 *
 * 둘 다 backfill 대상이 아니지만, 앞쪽은 삭제 경로의 결함을 뜻하므로 따로 볼 가치가 있다.
 */
function orphanReason(object) {
  const [root, ownerId] = object.path.split("/");
  if (root !== "system-templates") return "unknown-prefix";
  return liveVariantIds.has(ownerId) ? "replaced-upload" : "deleted-owner";
}

function sumBytes(objects) {
  return objects.reduce((sum, object) => sum + object.size, 0);
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
