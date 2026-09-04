import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PRODUCTION_BRANCH = "main";
const PRODUCTION_SITE_URL = "https://talktheme.shop";
const LOCAL_HOST_PATTERN = /(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1)/i;
const VALID_MODES = new Set(["workers", "build", "deploy"]);

/**
 * Check the non-secret context that Cloudflare Workers Builds injects.
 *
 * This is intentionally not a security boundary: a local user can spoof an
 * environment variable. Cloudflare IAM must still be the authoritative
 * control that withholds production deploy permission from local credentials.
 */
export function getWorkersContextErrors(env = process.env, mode = "build") {
  const errors = [];

  if (!VALID_MODES.has(mode)) {
    errors.push(`알 수 없는 실행 모드: ${mode}`);
    return errors;
  }

  if (env.WORKERS_CI !== "1") {
    errors.push("WORKERS_CI=1이 필요합니다. production 명령은 Cloudflare Workers Builds에서만 실행합니다.");
  }

  if (!env.WORKERS_CI_BRANCH) {
    errors.push("WORKERS_CI_BRANCH가 필요합니다.");
  } else if (mode !== "workers" && env.WORKERS_CI_BRANCH !== PRODUCTION_BRANCH) {
    errors.push(`WORKERS_CI_BRANCH가 ${PRODUCTION_BRANCH}여야 합니다.`);
  }

  const isProductionBuild = mode === "build" || (mode === "workers" && env.WORKERS_CI_BRANCH === PRODUCTION_BRANCH);
  if (isProductionBuild && env.NEXT_PUBLIC_SITE_URL !== PRODUCTION_SITE_URL) {
    errors.push(`NEXT_PUBLIC_SITE_URL은 ${PRODUCTION_SITE_URL}이어야 합니다.`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || typeof value !== "string") continue;
    if (!/(URL|ORIGIN|HOST)$/i.test(key)) continue;
    if (LOCAL_HOST_PATTERN.test(value)) {
      errors.push(`${key}에 localhost 또는 로컬 loopback 주소가 포함되어 있습니다.`);
    }
  }

  return [...new Set(errors)];
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function main() {
  const mode = process.argv[2] ?? "build";
  const errors = getWorkersContextErrors(process.env, mode);

  if (errors.length > 0) {
    console.error(`[workers-${mode}-guard] Workers Builds context 검증 실패`);
    for (const error of errors) console.error(`- ${error}`);
    console.error("로컬에서는 cf:build:workers/cf:build:production/cf:deploy:production 대신 cf:build와 wrangler deploy --dry-run만 사용하세요.");
    process.exitCode = 1;
    return;
  }

  console.log(`[workers-${mode}-guard] Workers Builds context 확인`);
}

if (isDirectExecution()) main();
