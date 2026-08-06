// 갤러리 카드 썸네일을 비공개 버킷에서 공개 버킷으로 복사한다.
//
// 20260806090000_theme_public_bucket.sql 이후 새 썸네일은 `theme-public` 에 올라가지만,
// 이미 저장된 것들은 `theme-assets` 에 남아 있다. 그대로 두면 기존 시스템 템플릿 카드가
// 빈 이미지가 된다. 템플릿을 다시 저장하면 재생성되지만, 손대지 않을 템플릿도 있으므로
// 한 번 복사해 둔다.
//
//   node scripts/copy-card-thumbnails-to-public.mjs            # 무엇을 옮길지만 출력
//   node scripts/copy-card-thumbnails-to-public.mjs --apply
//
// 원본은 지우지 않는다. 되돌릴 일이 생겨도 파일이 남아 있어야 한다.

import { readFileSync } from "node:fs";

const root = process.cwd();
const env = {};
for (const line of readFileSync(`${root}/.env.local`, "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error(".env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요합니다.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
const target = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost") ? "로컬" : "운영";

const res = await fetch(`${supabaseUrl}/rest/v1/system_template_variants?select=id,preview_metadata`, { headers });
if (!res.ok) throw new Error(`variant 조회 실패: ${res.status} ${await res.text()}`);
const rows = await res.json();

const paths = rows
  .map((row) => row.preview_metadata?.cardPreviewPath)
  .filter((path) => typeof path === "string" && path.length > 0);

console.log(`대상 DB: ${target}`);
console.log(`variant ${rows.length}개 중 카드 썸네일 ${paths.length}개\n`);

let copied = 0;
let missing = 0;
for (const path of paths) {
  const source = await fetch(`${supabaseUrl}/storage/v1/object/theme-assets/${path}`, { headers });
  if (!source.ok) {
    console.log(`  건너뜀  ${path}  (원본 없음 ${source.status})`);
    missing += 1;
    continue;
  }
  if (!apply) {
    console.log(`  복사 예정  ${path}`);
    copied += 1;
    continue;
  }
  const body = await source.arrayBuffer();
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/theme-public/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "image/webp", "x-upsert": "true" },
    body,
  });
  if (!upload.ok) throw new Error(`${path} 업로드 실패: ${upload.status} ${await upload.text()}`);
  console.log(`  복사됨  ${path}`);
  copied += 1;
}

console.log(`\n${apply ? "복사" : "복사 예정"} ${copied}개, 원본 없음 ${missing}개`);
if (!apply) console.log("실제로 옮기려면 --apply 를 붙이세요. 원본은 지우지 않습니다.");
