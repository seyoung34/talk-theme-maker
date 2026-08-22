// 환경변수 오버레이를 얹고 명령을 실행한다.
//
//   node scripts/with-env.mjs supabase-local next dev
//   → .env.supabase-local 을 읽어 process.env 에 얹고 `next dev` 실행
//
// **왜 필요한가.** Next는 `.env.local` 파일 이름을 인자로 바꿀 수 없다. 대신 `@next/env`가
// **이미 값이 있는 키를 `.env.local`로 덮어쓰지 않으므로**, 프로세스 환경변수로 앞세우면 파일을
// 건드리지 않고 갈아끼울 수 있다. `playwright.config.ts`와 촬영 러너가 쓰는 것과 같은 성질이다.
//
// **왜 파일을 통째로 두 벌 두지 않는가.** 운영과 로컬은 13개 키 중 3개만 다르다. 전체를 복사해
// 두면 나머지 10개가 중복되고, 한쪽만 고쳤을 때 조용히 어긋난다. 오버레이는 다른 것만 담는다.
//
// **PowerShell에는 `VAR=x cmd` 인라인 문법이 없다.** cross-env 같은 의존성을 새로 들이는 대신
// 이미 있는 Node로 처리한다.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [overlayName, ...command] = process.argv.slice(2);

if (!overlayName || command.length === 0) {
  console.error("사용법: node scripts/with-env.mjs <오버레이 이름> <명령...>");
  console.error("  예:   node scripts/with-env.mjs supabase-local next dev");
  process.exit(1);
}

const overlayPath = path.join(projectRoot, `.env.${overlayName}`);
if (!existsSync(overlayPath)) {
  console.error(`오버레이 파일이 없습니다: ${path.relative(projectRoot, overlayPath)}`);
  process.exit(1);
}

/** `KEY=value` 만 읽는다. 주석·빈 줄·감싼 따옴표·`export ` 접두사를 걷어낸다. */
function parseEnvFile(contents) {
  const entries = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    const unquoted = /^(['"])(.*)\1$/.exec(rawValue);
    entries[key] = unquoted ? unquoted[2] : rawValue.trim();
  }
  return entries;
}

const overlay = parseEnvFile(readFileSync(overlayPath, "utf8"));
const env = { ...process.env };
const applied = [];
for (const [key, value] of Object.entries(overlay)) {
  // 셸에서 직접 준 값이 가장 구체적이므로 그쪽을 이긴 것으로 둔다.
  // 우선순위: 셸 > 오버레이 > .env.local
  if (process.env[key] !== undefined) continue;
  env[key] = value;
  applied.push(key);
}

/**
 * 어느 백엔드에 붙는지 한 줄로 알려 준다.
 *
 * 이게 없으면 "지금 운영이야 로컬이야?"를 매번 헷갈리게 되고, 그 헷갈림의 최악은 운영 데이터를
 * 로컬인 줄 알고 건드리는 것이다. 키 값이 아니라 주소만 보여 준다.
 */
const target = env.NEXT_PUBLIC_SUPABASE_URL;
console.log(`· 오버레이 .env.${overlayName} (${applied.length}개 적용)`);
if (target) console.log(`· Supabase ${target}`);

const child = spawn(command[0], command.slice(1), { cwd: projectRoot, env, shell: true, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
