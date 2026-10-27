import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `wrangler.jsonc`의 `vars`는 배포할 때마다 Worker 런타임 변수를 통째로 덮어쓴다. Workers Builds는
 * `--keep-vars` 없이 배포하므로 키를 지우면 그 변수는 운영에서 사라진다.
 *
 * #52가 allowlist 주석 블록을 고치다 서버 플래그 `ASSET_CATALOG_EXPORT_ENABLED_*` 두 줄을 같이 지웠고,
 * 서버가 참조를 거절(503)하는 동안 브라우저 producer 플래그는 켜져 있어 참조 export가 실패했다.
 * 값이 아니라 **키의 존재**를 막는 가드다. 롤백은 플래그를 "0"으로, 축소는 allowlist를 채워서 하므로
 * 값은 바뀌는 것이 정상이고 여기서는 보지 않는다.
 *
 * 읽는 쪽은 `exportGate.ts`와 `recommended/route.ts`다. 키를 더하거나 바꾸면 이 목록도 함께 고친다.
 */
const requiredServerFlags = [
  "ASSET_CATALOG_EXPORT_ENABLED_ANDROID",
  "ASSET_CATALOG_EXPORT_ENABLED_IOS",
] as const;

/** 값이 비어 있어도 "제한 없음"이라는 뜻이라 키는 남겨 둔다. 긴급 축소 수단이다. */
const requiredScopeVariables = [
  "ASSET_CATALOG_EXPORT_ANDROID_ASSET_ALLOWLIST",
  "ASSET_CATALOG_EXPORT_IOS_ASSET_ALLOWLIST",
  "ASSET_CATALOG_EXPORT_ANDROID_USER_ALLOWLIST",
  "ASSET_CATALOG_EXPORT_IOS_USER_ALLOWLIST",
] as const;

function readWranglerVars(): Record<string, unknown> {
  const source = readFileSync(path.resolve(process.cwd(), "wrangler.jsonc"), "utf8");
  const json = source
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  const config = JSON.parse(json) as { vars?: Record<string, unknown> };
  if (!config.vars) throw new Error("wrangler.jsonc에 vars가 없습니다.");
  return config.vars;
}

describe("wrangler.jsonc catalog export rollout variables", () => {
  const vars = readWranglerVars();

  it.each(requiredServerFlags)("keeps the server flag %s", (key) => {
    expect(vars, `${key}가 wrangler.jsonc vars에서 빠졌습니다. 배포하면 운영 변수가 사라집니다.`).toHaveProperty(key);
    expect(["0", "1"]).toContain(vars[key]);
  });

  it.each(requiredScopeVariables)("keeps the scope variable %s as a string", (key) => {
    expect(vars, `${key}가 wrangler.jsonc vars에서 빠졌습니다.`).toHaveProperty(key);
    expect(typeof vars[key]).toBe("string");
  });

  it("keeps the catalog write-shadow flag", () => {
    expect(vars).toHaveProperty("ASSET_CATALOG_WRITE_ENABLED");
  });
});
