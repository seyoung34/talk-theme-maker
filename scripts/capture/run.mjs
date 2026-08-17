// 촬영 CLI.
//
//   node scripts/capture/run.mjs --profile=guide
//   node scripts/capture/run.mjs --profile=guide --server=http://127.0.0.1:3000 --scenes=editor-tour
//
// 기본 동작은 **Supabase 설정을 비운 채로 빌드하고 기동**하는 것이다(계획서 §2.7). e2e 하네스와
// 같은 이유다 — 크레딧이 소모되지 않고, 같은 명령이 같은 화면을 낸다.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProfile } from "./profiles.mjs";
import { runCapture } from "./runner.mjs";
import { defaultSceneIds, selectScenes } from "./scenes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const capturePort = Number(process.env.CAPTURE_PORT ?? 3311);

/**
 * 촬영 서버 환경. `playwright.config.ts`의 `serverEnv`와 같은 목적이다.
 *
 * `NEXT_PUBLIC_*`은 **빌드 시점에 번들로 구워진다.** 그래서 기동할 때만 비워서는 소용이 없고,
 * 빌드까지 이 환경으로 돌려야 개발자의 운영 Supabase 키가 촬영본 번들에 들어가지 않는다.
 * `--no-build`가 위험한 이유가 이것이다.
 */
const serverEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${capturePort}`,
};

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (!match) throw new Error(`알 수 없는 인자: ${token}`);
    args[match[1]] = match[2] ?? true;
  }
  return args;
}

function resolveOutDir(args, profileId) {
  if (typeof args.out === "string") return path.resolve(args.out);
  // 계획서 §6.3: 촬영 원본은 저장소에 커밋하지 않는다.
  const external = "E:\\TalkTheme-자료\\촬영본";
  if (existsSync(path.parse(external).root)) return path.join(external, profileId);
  const fallback = path.join(projectRoot, ".capture-out", profileId);
  console.warn(`! ${external}에 접근할 수 없어 ${fallback}에 저장합니다.`);
  return fallback;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, shell: true, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} 실패 (exit ${code})`))));
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fetch(url).then((res) => res.ok || res.status === 404).catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`서버가 ${timeoutMs / 1000}초 안에 뜨지 않았습니다: ${url}`);
}

async function startServer() {
  const env = { ...process.env, ...serverEnv };
  const baseURL = serverEnv.NEXT_PUBLIC_SITE_URL;
  const child = spawn("npx", ["next", "start", "--port", String(capturePort), "--hostname", "127.0.0.1"], {
    cwd: projectRoot,
    shell: true,
    env,
    stdio: "ignore",
  });
  await waitForServer(baseURL);
  return { baseURL, stop: () => child.kill() };
}

const args = parseArgs(process.argv.slice(2));
const profile = getProfile(typeof args.profile === "string" ? args.profile : "guide");
const sceneIds = typeof args.scenes === "string" ? args.scenes.split(",").map((s) => s.trim()) : defaultSceneIds;
const scenes = selectScenes(sceneIds);
const outDir = resolveOutDir(args, profile.id);

let server = null;
let baseURL = typeof args.server === "string" ? args.server.replace(/\/$/, "") : null;
const captureEnv = baseURL ? "external" : "mock";

try {
  if (!baseURL) {
    if (args["no-build"]) {
      console.warn("! --no-build: 이전 빌드를 그대로 씁니다. 운영 Supabase 키가 번들에 구워져 있을 수 있습니다.");
      if (!existsSync(path.join(projectRoot, ".next"))) throw new Error(".next가 없습니다. --no-build를 빼고 다시 실행하세요.");
    } else {
      console.log("· Supabase를 비운 채로 빌드합니다 (몇 분 걸립니다. 이미 빌드했다면 --no-build)");
      await run("npx", ["next", "build"], { env: { ...process.env, ...serverEnv } });
    }
    console.log("· 촬영 서버 기동");
    server = await startServer();
    baseURL = server.baseURL;
  }

  console.log(`· 프로필 ${profile.id} (${profile.label}) / 씬 ${sceneIds.join(", ")}`);
  console.log(`· 출력 ${outDir}\n`);

  const manifest = await runCapture({ profile, scenes, baseURL, outDir, captureEnv });

  const { measured, spec } = manifest;
  console.log(`\n· 실측 ${measured.width}x${measured.height} @ ${measured.fps}fps, ${measured.durationSec}초`);
  if (!manifest.meetsSpec) {
    console.log(`  규격 ${spec.width}x${spec.height} 미달 — screencast의 해상도 상한은 뷰포트 CSS 픽셀입니다.`);
    console.log("  1920x1080은 page.screenshot() 백엔드(Phase B2)로만 나옵니다.");
  }
  console.log(`· 산출물 ${Object.values(manifest.outputs).join(", ")}`);
  console.log(`· manifest capture-manifest.json`);
} finally {
  server?.stop();
}
