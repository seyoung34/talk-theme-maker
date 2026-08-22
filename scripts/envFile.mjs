// `.env.*` 오버레이 파일 읽기. `with-env.mjs`와 촬영 러너가 같은 파일을 같은 규칙으로 읽는다.
//
// 두 곳이 각자 파싱하면 한쪽만 따옴표나 주석을 처리하게 되고, 그 차이는 "명령으로는 되는데
// 촬영에서는 안 된다"로 나타난다. 규칙을 한 곳에 둔다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `KEY=value` 만 읽는다. 주석·빈 줄·감싼 따옴표·`export ` 접두사를 걷어낸다. */
export function parseEnvFile(contents) {
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

/** `.env.<name>` 을 읽는다. 없으면 무엇을 만들어야 하는지 알려 주고 던진다. */
export function readEnvOverlay(name) {
  const overlayPath = path.join(projectRoot, `.env.${name}`);
  if (!existsSync(overlayPath)) {
    throw new Error(
      `오버레이 파일이 없습니다: .env.${name}\n` +
        "  로컬 Supabase 값은 `npx supabase start` 출력에서 가져옵니다.",
    );
  }
  return parseEnvFile(readFileSync(overlayPath, "utf8"));
}
