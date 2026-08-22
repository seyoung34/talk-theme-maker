// 로컬 Supabase의 시스템 템플릿·추천 에셋을 fixture로 내보내고 다시 심는다.
//
//   node scripts/capture-fixtures.mjs export    로컬 DB → fixture 디렉터리
//   node scripts/capture-fixtures.mjs seed      fixture 디렉터리 → 로컬 DB
//
// **왜 필요한가.** `supabase db reset`은 스키마만 되돌리므로 데이터가 전부 사라진다. 시스템
// 템플릿 하나를 `/admin`에서 손으로 만드는 데 드는 시간이 적지 않은데, 마이그레이션을 검증할
// 때마다 그걸 다시 하게 된다. `seed-local-users.mjs`가 계정에 대해 하는 일을 템플릿·에셋에
// 대해 한다.
//
// **왜 SQL seed가 아닌가.** `supabase/seed.sql`은 테이블 행만 넣는다. 시스템 템플릿은 실제
// 이미지가 Storage에 있어야 성립하므로(배경·말풍선·탭 아이콘, 그리고 구워 둔 프리뷰) SQL만으로는
// 절반만 복원된다.
//
// **왜 fixture를 저장소에 안 넣는가.** 템플릿 한 벌이 약 5MB이고 그 대부분이 배경 PNG다. git
// 히스토리에 영구히 남길 값어치보다, 촬영 자료가 이미 사는 곳에 두고 필요할 때 내보내는 쪽이
// 가볍다. 다른 기계에서 복원해야 하면 `--dir`로 그 디렉터리를 넘긴다.
//
// 로컬 주소가 아니면 거부한다. `seed-local-users.mjs`와 같은 이유로, 운영 데이터를 건드리는
// 사고를 코드에서 막는다.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const dbContainer = process.env.SUPABASE_LOCAL_DB_CONTAINER ?? "supabase_db_kakaotalk-theme-maker";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`로컬 주소가 아닙니다: ${API}`);
  process.exit(1);
}

const buckets = ["theme-assets", "theme-public"];
/**
 * 내보내고 다시 심는 테이블. 순서가 곧 삽입 순서다 — 외래키가 걸려 있어 부모가 먼저다.
 * `admin_asset_variants`/`bubble_specs`는 지금 비어 있어도 나중에 생기면 자동으로 따라온다.
 */
const tables = [
  "admin_assets",
  "admin_asset_targets",
  "admin_asset_variants",
  "admin_asset_bubble_specs",
  "system_template_bundles",
  "system_template_variants",
];
/** 계정 UUID는 `db reset` + 계정 재생성마다 바뀐다. 그대로 심으면 외래키가 깨진다. */
const userRefColumns = new Set(["created_by"]);

const args = process.argv.slice(2);
const command = args.find((token) => !token.startsWith("--"));
const dirArg = args.find((token) => token.startsWith("--dir="))?.slice(6);
const fixtureDir = path.resolve(dirArg ?? defaultFixtureDir());

function defaultFixtureDir() {
  const external = "E:\\TalkTheme-자료\\촬영본\\fixtures";
  if (existsSync(path.parse(external).root)) return external;
  return path.join(process.cwd(), ".capture-out", "fixtures");
}

function sql(statement) {
  return execFileSync("docker", ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", statement], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const storageHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function exportFixture() {
  await mkdir(fixtureDir, { recursive: true });

  const rows = {};
  for (const table of tables) {
    // json_agg으로 통째로 받는다. 컬럼이 늘어나도 스크립트를 고칠 필요가 없다.
    const raw = sql(`select coalesce(json_agg(t), '[]') from public.${table} t;`).trim();
    rows[table] = JSON.parse(raw);
    console.log(`  ${table.padEnd(26)} ${rows[table].length}행`);
  }

  const objects = [];
  for (const bucket of buckets) {
    const listed = JSON.parse(
      sql(`select coalesce(json_agg(json_build_object('name', name, 'mime', metadata->>'mimetype')), '[]') from storage.objects where bucket_id = '${bucket}';`).trim(),
    );
    for (const { name, mime } of listed) {
      const res = await fetch(`${API}/storage/v1/object/${bucket}/${encodeURI(name)}`, { headers: storageHeaders });
      if (!res.ok) throw new Error(`${bucket}/${name} 내려받기 실패: ${res.status}`);
      const target = path.join(fixtureDir, "objects", bucket, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      objects.push({ bucket, name, mime: mime ?? "application/octet-stream" });
    }
    console.log(`  ${bucket.padEnd(26)} ${listed.length}개 객체`);
  }

  await writeFile(path.join(fixtureDir, "fixture.json"), `${JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), rows, objects }, null, 2)}\n`, "utf8");
  console.log(`\n내보냄: ${fixtureDir}`);
}

async function seedFixture() {
  const manifestPath = path.join(fixtureDir, "fixture.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`fixture가 없습니다: ${manifestPath}\n  먼저 'node scripts/capture-fixtures.mjs export'를 실행하세요.`);
  }
  const fixture = JSON.parse(await readFile(manifestPath, "utf8"));

  // 계정 UUID 재매핑 대상. 관리자가 없으면 null로 둔다 — 컬럼이 nullable이라 문제되지 않는다.
  const adminId = sql("select user_id from public.admin_profiles limit 1;").trim() || null;
  if (!adminId) console.warn("! 관리자 계정이 없습니다. created_by를 비웁니다 (seed-local-users.mjs를 먼저 돌리면 채워집니다)");

  for (const { bucket, name, mime } of fixture.objects) {
    const body = await readFile(path.join(fixtureDir, "objects", bucket, name));
    const url = `${API}/storage/v1/object/${bucket}/${encodeURI(name)}`;
    // 이미 있으면 덮어쓴다. 같은 fixture를 여러 번 심어도 결과가 같아야 한다.
    const res = await fetch(url, { method: "POST", headers: { ...storageHeaders, "Content-Type": mime, "x-upsert": "true" }, body });
    if (!res.ok) throw new Error(`${bucket}/${name} 업로드 실패: ${res.status} ${await res.text()}`);
  }
  console.log(`  객체 ${fixture.objects.length}개 업로드`);

  for (const table of tables) {
    const rows = fixture.rows[table] ?? [];
    if (!rows.length) continue;
    const remapped = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([column, value]) => [column, userRefColumns.has(column) && value ? adminId : value])),
    );
    /**
     * 값을 SQL 리터럴로 직접 쓰지 않고 `json_populate_recordset`에 통째로 넘긴다.
     *
     * 컬럼 타입을 스크립트가 추측하면 반드시 틀린다. 처음엔 객체를 JSON 문자열로 감쌌는데
     * `tags`가 `text[]`라 `[]`가 그대로 들어가 `malformed array literal`로 깨졌다 — jsonb와
     * 배열은 값만 봐서 구분할 수 없다. 테이블 타입을 아는 것은 Postgres뿐이므로 변환을 그쪽에
     * 맡긴다. 덕분에 컬럼이 늘어도 이 코드는 그대로다.
     */
    sql(
      `insert into public.${table} select * from json_populate_recordset(null::public.${table}, ` +
        `$fixture$${JSON.stringify(remapped)}$fixture$) on conflict (id) do nothing;`,
    );
    console.log(`  ${table.padEnd(26)} ${rows.length}행`);
  }

  console.log(`\n심음: ${fixtureDir}`);
}

if (command === "export") await exportFixture();
else if (command === "seed") await seedFixture();
else {
  console.error("사용법: node scripts/capture-fixtures.mjs <export|seed> [--dir=<경로>]");
  process.exit(1);
}
