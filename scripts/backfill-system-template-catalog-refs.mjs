#!/usr/bin/env node
/**
 * 시스템 템플릿 `upload_refs`의 legacy Storage 참조를 catalog 참조로 바꾼다.
 *
 * 왜 필요한가
 * -----------
 * catalog ref는 **저장 시점에 편집기가 catalog metadata를 들고 있던 항목만** 보존된다
 * (`supabaseRepository.ts`의 `shouldPersistCatalogReference`). 기존 템플릿은 에셋 allowlist가
 * 1개로 묶여 있던 시기에 제작돼 전부 legacy 업로드로 구워졌다. 그래서 allowlist를 열어도
 * 기존 템플릿 export는 계속 바이트를 올린다.
 *
 * 편집기에서 "다시 저장"해도 고쳐지지 않는다. hydration이 catalog 없는 ref를 catalog 없는
 * entry로 복원하고, 저장이 다시 legacy로 굽기 때문이다. 데이터를 직접 고쳐 쓰는 수밖에 없다.
 *
 * 무엇을 하는가
 * -------------
 * 항목마다 registry(`theme_asset_objects`)의 active 행을 찾아 참조 형태로 바꾼다. 원본 바이트는
 * 건드리지 않는다. Supabase Storage 객체도 지우지 않는다(아키텍처 §14 불변 조건).
 *
 *   tpl:<upload id>    시스템 템플릿 업로드
 *   admin:<asset id>   추천 에셋에서 고른 항목
 *
 * 안전 장치
 * ---------
 * - 기본이 dry-run이다. `--apply` 없이는 절대 쓰지 않는다.
 * - `--apply` 시 변경 전 `upload_refs` 전체를 JSON으로 백업한다.
 * - 멱등하다. 이미 catalog인 항목은 건너뛴다.
 * - `imageEdit`가 있는 항목은 건너뛴다. 변환본은 원본과 바이트가 다르다.
 * - **`storagePath`를 그대로 남긴다.** 저장 경로(PR #31)가 쓰는 형태와 같게 맞춘 것이다. 떼어 내면
 *   편집기가 바이트를 못 받아 슬롯 이미지가 빈다 — 편집기는 부트스트랩에서 서명한 슬롯 외에는
 *   `catalog.previewUrl`이 없고, 그때 기댈 곳이 `storagePath`뿐이다. 실제로 떼고 적용했다가
 *   탭 아이콘이 비는 것을 확인하고 되돌렸다.
 * - `catalogMetadata.legacyStoragePath`도 함께 남겨 미리보기 굽기와 변환 fallback이 동작한다.
 *
 * 사용법
 * ------
 *   node scripts/backfill-system-template-catalog-refs.mjs
 *   node scripts/backfill-system-template-catalog-refs.mjs --variant <id>
 *   node scripts/backfill-system-template-catalog-refs.mjs --apply
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const variantFilter = args.includes("--variant") ? args[args.indexOf("--variant") + 1] : undefined;
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
/** 리포트·백업은 저장소를 더럽히지 않도록 기본적으로 임시 디렉터리에 쓴다. */
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : resolve(tmpdir(), "talktheme-backfill");

function readEnv(file) {
  const fromProcess = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };
  if (fromProcess.NEXT_PUBLIC_SUPABASE_URL && fromProcess.SUPABASE_SECRET_KEY) return fromProcess;

  const text = readFileSync(resolve(process.cwd(), file), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = readEnv(envFile);
const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!baseUrl || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요합니다.");
  process.exit(1);
}

const headers = { apikey: secret, authorization: `Bearer ${secret}` };

async function get(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status} ${await response.text()}`);
  return response.json();
}

async function patch(path, body) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`PATCH ${path} -> ${response.status} ${await response.text()}`);
}

/** 플랫폼 전용 파생물이 생기면 그것을 먼저 쓰고, 없으면 canonical로 떨어진다. */
function pickRecord(records, platform) {
  return records.find((record) => record.variant_key === platform) ?? records.find((record) => record.variant_key === "canonical");
}

function convertEntry(entry, activeByLogical, platform) {
  if (entry.catalog) return { action: "skip", reason: "already-catalog" };
  if (entry.imageEdit) return { action: "skip", reason: "image-edit" };

  const logicalAssetId = [`tpl:${entry.id}`, `admin:${entry.id}`].find((key) => activeByLogical.has(key));
  if (!logicalAssetId) return { action: "skip", reason: "no-registry-row" };

  const record = pickRecord(activeByLogical.get(logicalAssetId), platform);
  if (!record) return { action: "skip", reason: "no-usable-variant-key" };
  if (record.mime_type !== "image/png" || record.png_signature_verified !== true) {
    return { action: "skip", reason: "not-exportable" };
  }

  const legacyStoragePath = entry.storagePath ?? entry.catalogMetadata?.legacyStoragePath;
  const next = {
    ...entry,
    id: entry.id,
    fileName: record.file_name,
    mimeType: record.mime_type,
    size: record.size_bytes,
    catalog: {
      kind: "catalog",
      assetId: record.logical_asset_id,
      revision: record.revision,
      variantKey: record.variant_key,
    },
    catalogMetadata: {
      fileName: record.file_name,
      mimeType: record.mime_type,
      size: record.size_bytes,
      sourceScale: record.source_scale,
      width: record.width,
      height: record.height,
      pngSignatureVerified: true,
      // 미리보기 해석과 변환 fallback이 이 경로를 쓴다. 반드시 남긴다.
      ...(legacyStoragePath ? { legacyStoragePath } : {}),
    },
  };
  return { action: "convert", entry: next, logicalAssetId };
}

const objects = await get(
  "theme_asset_objects?select=id,logical_asset_id,revision,variant_key,status,mime_type,png_signature_verified,source_scale,width,height,size_bytes,file_name&limit=5000",
);
const activeByLogical = new Map();
for (const record of objects) {
  if (record.status !== "active") continue;
  const list = activeByLogical.get(record.logical_asset_id) ?? [];
  list.push(record);
  activeByLogical.set(record.logical_asset_id, list);
}

const variantQuery = variantFilter
  ? `system_template_variants?select=id,bundle_id,platform,upload_refs&id=eq.${variantFilter}`
  : "system_template_variants?select=id,bundle_id,platform,upload_refs&limit=500";
const variants = await get(variantQuery);
const bundles = await get("system_template_bundles?select=id,title&limit=200");
const titleById = new Map(bundles.map((bundle) => [bundle.id, bundle.title]));

const totals = { converted: 0, skipped: {}, variantsChanged: 0 };
const plans = [];

for (const variant of variants) {
  const refs = variant.upload_refs ?? {};
  const nextRefs = {};
  let changed = 0;
  const skips = {};

  for (const [slotId, entries] of Object.entries(refs)) {
    if (!Array.isArray(entries)) {
      nextRefs[slotId] = entries;
      continue;
    }
    nextRefs[slotId] = entries.map((entry) => {
      const result = convertEntry(entry, activeByLogical, variant.platform);
      if (result.action === "convert") {
        changed += 1;
        totals.converted += 1;
        return result.entry;
      }
      skips[result.reason] = (skips[result.reason] ?? 0) + 1;
      totals.skipped[result.reason] = (totals.skipped[result.reason] ?? 0) + 1;
      return entry;
    });
  }

  if (changed > 0) totals.variantsChanged += 1;
  plans.push({ variant, nextRefs, changed, skips });
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(outDir, { recursive: true });
const reportPath = resolve(outDir, `backfill-report-${stamp}.json`);
writeFileSync(
  reportPath,
  JSON.stringify(
    plans.map(({ variant, changed, skips }) => ({
      title: titleById.get(variant.bundle_id),
      platform: variant.platform,
      variantId: variant.id,
      changed,
      skips,
    })),
    null,
    2,
  ),
);

console.log(`${apply ? "APPLY" : "DRY-RUN"} — variant ${variants.length}개`);
for (const { variant, changed, skips } of plans) {
  const skipText = Object.entries(skips).map(([reason, count]) => `${reason}:${count}`).join(" ") || "-";
  console.log(`  ${titleById.get(variant.bundle_id) ?? variant.bundle_id} / ${variant.platform}  변환 ${changed}  건너뜀 ${skipText}`);
}
console.log(`\n합계: 변환 ${totals.converted} · 변경 variant ${totals.variantsChanged}`);
console.log(`건너뜀: ${JSON.stringify(totals.skipped)}`);
console.log(`리포트: ${reportPath}`);

if (!apply) {
  const sample = plans.find((plan) => plan.changed > 0);
  if (sample) {
    const slotId = Object.keys(sample.nextRefs).find((key) => sample.nextRefs[key]?.some?.((entry) => entry.catalog));
    console.log(`\n샘플 (${titleById.get(sample.variant.bundle_id)} / ${slotId}):`);
    console.log("  before:", JSON.stringify((sample.variant.upload_refs?.[slotId] ?? [])[0]));
    console.log("  after :", JSON.stringify(sample.nextRefs[slotId][0]));
  }
  console.log("\n실제 반영하려면 --apply 를 붙여 다시 실행하세요.");
  process.exit(0);
}

const backupPath = resolve(outDir, `backfill-backup-${stamp}.json`);
writeFileSync(
  backupPath,
  JSON.stringify(variants.map(({ id, bundle_id, platform, upload_refs }) => ({ id, bundle_id, platform, upload_refs })), null, 2),
);
console.log(`\n백업: ${backupPath}`);

for (const { variant, nextRefs, changed } of plans) {
  if (changed === 0) continue;
  await patch(`system_template_variants?id=eq.${variant.id}`, { upload_refs: nextRefs });
  console.log(`  적용 ${titleById.get(variant.bundle_id)} / ${variant.platform} (${changed}건)`);
}
console.log("완료.");
