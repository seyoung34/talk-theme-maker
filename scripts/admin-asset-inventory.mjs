/**
 * 관리자 에셋 lifecycle inventory (계획 Phase 0A/0B).
 *
 * **읽기만 한다.** DB도 Storage도 바꾸지 않는다. Phase 4·5를 할지, 얼마나 급한지를 숫자로
 * 판단하기 위한 스냅샷이다.
 *
 * 세는 것:
 *   1. kind별 행 수와 미분류(`asset_kind is null`)   → Phase 1의 500 상한, Phase 4 backfill 규모
 *   2. `enabled=false` 잔존 수                        → `enabled` 게이트 제거의 실제 영향 범위
 *   3. target 종류 분포와 `shape_rule` 건수           → Phase 4 변환 대상
 *   4. catalog pointer 상태와 R2 썸네일 coverage      → Phase 1 폴백 비용, pointer repair 대상
 *   5. Storage prefix orphan 후보                     → Phase 5 GC 대상
 *   6. 시스템 템플릿이 붙들고 있는 catalog 참조       → Phase 5 삭제의 참조 root
 *
 * 사용법:
 *   node scripts/admin-asset-inventory.mjs
 *   node scripts/admin-asset-inventory.mjs --env .env.local --json docs/report/admin-asset-inventory.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parseEnvFile } from "./envFile.mjs";

const args = process.argv.slice(2);
const envPath = readFlag("--env") ?? ".env.local";
const jsonPath = readFlag("--json");

if (!existsSync(envPath)) {
  console.error(`환경 파일이 없습니다: ${envPath}\n  다른 경로면 --env <경로>로 지정하세요.`);
  process.exit(1);
}
const env = parseEnvFile(readFileSync(envPath, "utf8"));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.`);
  process.exit(1);
}

/** 앱과 같은 값이어야 한다. 어긋나면 이 리포트가 앱이 보는 것과 다른 세계를 센다. */
const ADMIN_PREFIX = "admin:";
const STORAGE_BUCKET = "theme-assets";
const STORAGE_ROOT = "admin-assets";
const PICKER_PRESET = "picker";
/** 목록 라우트가 kind 하나에서 전량 로드를 포기하는 경계. */
const LIST_ROW_LIMIT = 500;

const report = await buildReport();
printReport(report);
if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nJSON 저장: ${jsonPath}`);
}

async function buildReport() {
  const assets = await selectRows("admin_assets", "id,asset_kind,enabled,storage_path,asset_object_id,created_at,updated_at");
  const targets = await selectRows("admin_asset_targets", "asset_id,platform,slot_role,target_kind,enabled");
  const variants = await selectRows("admin_asset_variants", "asset_id,platform,storage_path,asset_object_id");
  const registry = await selectRows("theme_asset_objects", "id,logical_asset_id,variant_key,status,r2_previews");
  const templateVariants = await selectRows("system_template_variants", "id,upload_refs");

  return {
    generatedAt: new Date().toISOString(),
    source: supabaseUrl,
    kinds: summariseKinds(assets),
    availability: summariseAvailability(assets, targets),
    targets: summariseTargets(targets),
    catalog: summariseCatalog(assets, variants, registry),
    storage: await summariseStorage(assets, variants),
    templateReferences: summariseTemplateReferences(templateVariants),
  };
}

/** Phase 1의 500 상한에 닿는 kind가 있는지, Phase 4가 backfill할 미분류가 있는지. */
function summariseKinds(assets) {
  const byKind = new Map();
  for (const asset of assets) {
    const key = asset.asset_kind ?? "(null)";
    byKind.set(key, (byKind.get(key) ?? 0) + 1);
  }
  const rows = [...byKind.entries()]
    .map(([kind, count]) => ({ kind, count, overListLimit: count > LIST_ROW_LIMIT }))
    .sort((left, right) => right.count - left.count);
  return { total: assets.length, unclassified: byKind.get("(null)") ?? 0, rows };
}

/**
 * `enabled` 게이트 제거의 실제 영향 범위.
 *
 * 추천·export·공개 Storage 접근에서 이 조건이 빠졌으므로, false로 남아 있던 행은 배포와
 * 동시에 후보로 노출된다. 0이면 아무 일도 일어나지 않는다.
 */
function summariseAvailability(assets, targets) {
  const disabledAssets = assets.filter((asset) => asset.enabled === false);
  const disabledTargets = targets.filter((target) => target.enabled === false);
  const disabledTargetAssetIds = new Set(disabledTargets.map((target) => target.asset_id));
  const assetsWithoutTargets = assets.filter((asset) => !targets.some((target) => target.asset_id === asset.id));
  return {
    disabledAssets: disabledAssets.length,
    disabledAssetIds: disabledAssets.map((asset) => asset.id),
    disabledTargets: disabledTargets.length,
    assetsWithDisabledTarget: disabledTargetAssetIds.size,
    // target이 하나도 없으면 부모 컬럼으로 만든 legacy exact_role 하나만 남아 적용 범위가 좁아진다.
    assetsWithoutTargets: assetsWithoutTargets.length,
    assetsWithoutTargetIds: assetsWithoutTargets.map((asset) => asset.id),
  };
}

function summariseTargets(targets) {
  const byKind = new Map();
  for (const target of targets) byKind.set(target.target_kind, (byKind.get(target.target_kind) ?? 0) + 1);
  return {
    total: targets.length,
    byKind: Object.fromEntries(byKind),
    // 매칭 조건이 asset_kind와 동일하고 순위만 다르다. Phase 4의 변환 대상.
    shapeRule: byKind.get("shape_rule") ?? 0,
  };
}

/**
 * catalog pointer 상태.
 *
 * 목록·피커는 현재 `asset_object_id`와 일치하는 active registry row만 썸네일로 쓴다. 그래서
 * pointer가 비었거나 어긋난 수가 곧 "원본을 서명해 내려받는" 비용이다.
 */
function summariseCatalog(assets, variants, registry) {
  const byId = new Map(registry.map((row) => [row.id, row]));
  const activeIds = new Set(registry.filter((row) => row.status === "active").map((row) => row.id));
  const pickerIds = new Set(
    registry.filter((row) => readPickerObjectKey(row.r2_previews)).map((row) => row.id),
  );

  const pointers = [
    ...assets.map((asset) => ({ kind: "canonical", assetId: asset.id, objectId: asset.asset_object_id })),
    ...variants.map((variant) => ({ kind: variant.platform, assetId: variant.asset_id, objectId: variant.asset_object_id })),
  ];

  const missing = pointers.filter((pointer) => !pointer.objectId);
  const dangling = pointers.filter((pointer) => pointer.objectId && !byId.has(pointer.objectId));
  const inactive = pointers.filter((pointer) => pointer.objectId && byId.has(pointer.objectId) && !activeIds.has(pointer.objectId));
  const withThumbnail = pointers.filter((pointer) => pointer.objectId && pickerIds.has(pointer.objectId));

  const statusCounts = new Map();
  for (const row of registry) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);

  return {
    registryRows: registry.length,
    registryByStatus: Object.fromEntries(statusCounts),
    pointers: pointers.length,
    pointerMissing: missing.length,
    pointerDangling: dangling.length,
    pointerInactive: inactive.length,
    thumbnailCovered: withThumbnail.length,
    // 목록·피커가 원본 signed URL로 떨어지는 수. 전량 로드 비용의 실체다.
    thumbnailFallback: pointers.length - withThumbnail.length,
    danglingSamples: dangling.slice(0, 10),
  };
}

/**
 * Storage에 남아 있는데 DB가 가리키지 않는 객체.
 *
 * 일반 재저장은 새 revision 경로에 올리고 이전 파일을 지우지 않으며, 삭제는 현재 행이 가리키는
 * 경로만 지운다. 그래서 여기 쌓이는 수가 곧 Phase 5가 회수할 용량이다.
 */
async function summariseStorage(assets, variants) {
  const referenced = new Set([
    ...assets.map((asset) => asset.storage_path),
    ...variants.map((variant) => variant.storage_path),
  ].filter(Boolean));

  const objects = await listStorageObjects(STORAGE_ROOT);
  const orphans = objects.filter((object) => !referenced.has(object.path));
  const orphanBytes = orphans.reduce((total, object) => total + (object.size ?? 0), 0);
  const knownAssetIds = new Set(assets.map((asset) => asset.id));
  // 소유 에셋이 이미 삭제된 prefix. DB에서는 영영 보이지 않는다.
  const ownerlessOrphans = orphans.filter((object) => {
    const owner = object.path.split("/")[1];
    return owner && !knownAssetIds.has(owner);
  });

  return {
    objects: objects.length,
    referenced: referenced.size,
    orphans: orphans.length,
    orphanBytes,
    orphanMegabytes: Math.round((orphanBytes / (1024 * 1024)) * 10) / 10,
    ownerlessOrphans: ownerlessOrphans.length,
    orphanSamples: orphans.slice(0, 10).map((object) => object.path),
  };
}

/**
 * 발행된 템플릿이 붙들고 있는 관리자 에셋.
 *
 * 이 목록에 있는 자산은 물리 삭제 대상이 아니다 — 템플릿이 자기 내용물의 권한 근거이므로
 * 지우면 그 템플릿의 내보내기가 깨진다.
 */
function summariseTemplateReferences(templateVariants) {
  const referenced = new Set();
  for (const variant of templateVariants) collectCatalogAssetIds(variant.upload_refs, referenced);
  const adminIds = [...referenced].filter((id) => id.startsWith(ADMIN_PREFIX)).map((id) => id.slice(ADMIN_PREFIX.length));
  return {
    templateVariants: templateVariants.length,
    referencedLogicalAssets: referenced.size,
    referencedAdminAssets: adminIds.length,
    referencedAdminAssetIds: adminIds,
  };
}

function collectCatalogAssetIds(value, into) {
  if (Array.isArray(value)) {
    for (const item of value) collectCatalogAssetIds(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const catalog = value.catalog;
  if (catalog && typeof catalog === "object" && typeof catalog.assetId === "string") into.add(catalog.assetId);
  for (const child of Object.values(value)) collectCatalogAssetIds(child, into);
}

function readPickerObjectKey(previews) {
  if (!previews || typeof previews !== "object") return undefined;
  const entry = previews[PICKER_PRESET];
  return entry && typeof entry === "object" && typeof entry.objectKey === "string" ? entry.objectKey : undefined;
}

/** Storage list는 한 prefix씩만 돌려준다. 폴더를 만나면 그 안으로 내려간다. */
async function listStorageObjects(prefix, depth = 0) {
  if (depth > 6) return [];
  const collected = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${STORAGE_BUCKET}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, apikey: secretKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!response.ok) throw new Error(`Storage 목록 실패(${prefix}): HTTP ${response.status}`);
    const page = await response.json();
    for (const entry of page) {
      const path = `${prefix}/${entry.name}`;
      // id가 없는 항목은 파일이 아니라 하위 폴더다.
      if (entry.id) collected.push({ path, size: entry.metadata?.size ?? 0 });
      else collected.push(...(await listStorageObjects(path, depth + 1)));
    }
    if (page.length < 100) return collected;
  }
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

function printReport(value) {
  const line = (label, text) => console.log(`  ${label.padEnd(28)} ${text}`);

  console.log(`\n관리자 에셋 inventory — ${value.generatedAt}`);
  console.log(`대상: ${value.source}\n`);

  console.log("[1] 종류별 행 수");
  line("전체", `${value.kinds.total}개`);
  line("미분류(asset_kind null)", `${value.kinds.unclassified}개${value.kinds.unclassified ? "  → Phase 4 backfill 대상" : ""}`);
  for (const row of value.kinds.rows) {
    line(`  ${row.kind}`, `${row.count}개${row.overListLimit ? `  → ${LIST_ROW_LIMIT}개 상한 초과` : ""}`);
  }

  console.log("\n[2] 가용성 (enabled 게이트 제거 영향)");
  line("enabled=false 에셋", `${value.availability.disabledAssets}개${value.availability.disabledAssets ? "  → 배포와 동시에 후보로 노출됨" : "  → 영향 없음"}`);
  line("enabled=false target", `${value.availability.disabledTargets}개`);
  line("target 없는 에셋", `${value.availability.assetsWithoutTargets}개${value.availability.assetsWithoutTargets ? "  → 적용 범위가 좁아진 상태" : ""}`);

  console.log("\n[3] target 종류");
  line("전체", `${value.targets.total}개`);
  for (const [kind, count] of Object.entries(value.targets.byKind)) line(`  ${kind}`, `${count}개`);
  line("shape_rule", `${value.targets.shapeRule}개${value.targets.shapeRule ? "  → Phase 4 변환 대상" : "  → 이미 없음"}`);

  console.log("\n[4] catalog pointer / 썸네일");
  line("registry 행", `${value.catalog.registryRows}개 ${JSON.stringify(value.catalog.registryByStatus)}`);
  line("pointer 총계", `${value.catalog.pointers}개`);
  line("  비어 있음", `${value.catalog.pointerMissing}개`);
  line("  registry에 없음", `${value.catalog.pointerDangling}개${value.catalog.pointerDangling ? "  → repair 대상" : ""}`);
  line("  active 아님", `${value.catalog.pointerInactive}개`);
  line("썸네일 있음", `${value.catalog.thumbnailCovered}개`);
  line("원본 폴백", `${value.catalog.thumbnailFallback}개  → 전량 로드 시 내려받는 원본 수`);

  console.log("\n[5] Storage orphan (Phase 5 GC 대상)");
  line("객체 수", `${value.storage.objects}개`);
  line("DB가 참조", `${value.storage.referenced}개`);
  line("고아", `${value.storage.orphans}개 (${value.storage.orphanMegabytes}MB)`);
  line("  소유 에셋 없음", `${value.storage.ownerlessOrphans}개`);
  for (const sample of value.storage.orphanSamples) console.log(`      ${sample}`);

  console.log("\n[6] 템플릿 참조 (삭제 금지 대상)");
  line("템플릿 variant", `${value.templateReferences.templateVariants}개`);
  line("참조된 논리 자산", `${value.templateReferences.referencedLogicalAssets}개`);
  line("그중 관리자 에셋", `${value.templateReferences.referencedAdminAssets}개`);
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
