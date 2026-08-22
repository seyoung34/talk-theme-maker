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
import { readEnvOverlay } from "../envFile.mjs";
import { getProfile } from "./profiles.mjs";
import { runCapture } from "./runner.mjs";
import { defaultSceneIds, selectScenes } from "./scenes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const capturePort = Number(process.env.CAPTURE_PORT ?? 3311);

/**
 * 촬영 서버 환경. `playwright.config.ts`의 `serverEnv`와 같은 목적이다.
 *
 * `NEXT_PUBLIC_*`은 **빌드 시점에 번들로 구워진다.** 그래서 기동할 때만 바꿔서는 소용이 없고,
 * 빌드까지 이 환경으로 돌려야 한다. `--no-build`가 위험한 이유가 이것이다.
 *
 * **두 가지 백엔드가 필요하다.** 편집기만 보여 주는 씬은 Supabase가 없어도 되지만, 템플릿
 * 갤러리·추천 에셋·말풍선을 보여 주는 씬은 실제 데이터가 있어야 한다(계획서 §11.4).
 */
const captureEnvs = {
  /**
   * Supabase를 비운다. 크레딧이 소모되지 않고 원격 상태에 따라 화면이 흔들리지 않는다.
   * 시스템 템플릿과 추천 에셋은 **보이지 않는다.**
   */
  mock: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
  }),
  /**
   * 로컬 Supabase 스택. fixture(`scripts/capture-fixtures.mjs`)가 심어 둔 템플릿·에셋이 보인다.
   * `npm run dev:local`과 **같은 오버레이 파일**을 읽는다 — 두 곳이 다른 값을 쓰면 "개발에서는
   * 보이는데 촬영에는 안 나오는" 차이가 생긴다.
   */
  local: () => readEnvOverlay("supabase-local"),
};

function buildServerEnv(mode) {
  const backend = captureEnvs[mode];
  if (!backend) throw new Error(`알 수 없는 촬영 환경: ${mode}. 가능한 값: ${Object.keys(captureEnvs).join(", ")}`);
  return {
    ...backend(),
    // 촬영이 GA4에 이벤트를 남기지 않게 한다. 두 환경 모두 해당된다.
    NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${capturePort}`,
  };
}

/**
 * local 환경은 스택이 떠 있어야 한다. 꺼져 있으면 갤러리가 빈 채로 찍히는데, 그건 촬영이
 * 끝난 뒤에야 드러난다. 먼저 확인하고 무엇을 해야 하는지 알려 준다.
 */
async function assertLocalStackReady(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const ok = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
  }).then((res) => res.ok).catch(() => false);
  if (!ok) {
    throw new Error(
      [
        `로컬 Supabase에 닿지 않습니다: ${url}`,
        "  npx supabase start",
        "  node scripts/seed-local-users.mjs",
        "  node scripts/capture-fixtures.mjs seed",
      ].join("\n"),
    );
  }
}

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

async function startServer(serverEnv) {
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
const sceneIds = typeof args.scenes === "string" ? args.scenes.split(",").map((s) => s.trim()) : defaultSceneIds(profile.id);
// 배경 톤다운은 육안 QA로 값을 정하는 항목이라 프로필 기본값을 인자로 덮을 수 있게 둔다.
if (typeof args["tone-down"] === "string") profile.toneDown = Number(args["tone-down"]);
// 백엔드는 해상도와 연출 수단을 함께 결정한다. 가이드를 규격(1920x1080)으로 올리려면
// screenshot으로 바꾸면 되지만 커서·클릭 강조를 잃는다. 어느 쪽이 나은지는 눈으로 보고 정한다.
if (typeof args.backend === "string") profile.backend = args.backend;
const scenes = selectScenes(sceneIds, profile.id);
const outDir = resolveOutDir(args, profile.id);

let server = null;
let baseURL = typeof args.server === "string" ? args.server.replace(/\/$/, "") : null;
// `--server=`로 이미 떠 있는 서버를 쓰면 그 서버가 무엇을 보는지 여기서 알 수 없다.
const captureEnv = baseURL ? "external" : (typeof args.env === "string" ? args.env : "mock");
const serverEnv = baseURL ? null : buildServerEnv(captureEnv);

try {
  if (!baseURL) {
    if (args["no-build"]) {
      console.warn("! --no-build: 이전 빌드를 그대로 씁니다. 운영 Supabase 키가 번들에 구워져 있을 수 있습니다.");
      if (!existsSync(path.join(projectRoot, ".next"))) throw new Error(".next가 없습니다. --no-build를 빼고 다시 실행하세요.");
    } else {
      console.log(`· ${captureEnv} 환경으로 빌드합니다 (몇 분 걸립니다. 이미 빌드했다면 --no-build)`);
      await run("npx", ["next", "build"], { env: { ...process.env, ...serverEnv } });
    }
    // 갤러리가 빈 채로 찍히는 실패는 촬영이 끝난 뒤에야 드러난다. 먼저 막는다.
    if (captureEnv === "local") await assertLocalStackReady(serverEnv);
    console.log("· 촬영 서버 기동");
    server = await startServer(serverEnv);
    baseURL = server.baseURL;
  }

  console.log(`· 프로필 ${profile.id} (${profile.label}) / 백엔드 ${profile.backend} / 씬 ${sceneIds.join(", ")}`);
  console.log(`· 촬영 환경 ${captureEnv}${serverEnv?.NEXT_PUBLIC_SUPABASE_URL ? ` (${serverEnv.NEXT_PUBLIC_SUPABASE_URL})` : ""}`);
  if (profile.toneDown > 0) console.log(`· 배경 톤다운 ${Math.round(profile.toneDown * 100)}%`);
  console.log(`· 출력 ${outDir}\n`);

  const manifest = await runCapture({
    profile,
    scenes,
    baseURL,
    outDir,
    captureEnv,
    safeGuides: Boolean(args["safe-guides"]),
    keepFrames: Boolean(args["keep-frames"]),
  });

  const { measured, spec } = manifest;
  console.log(`\n· 실측 ${measured.width}x${measured.height} @ ${measured.fps}fps, ${measured.durationSec}초`);
  if (!manifest.meetsSpec) {
    console.log(`  규격 ${spec.width}x${spec.height} 미달 — screencast의 해상도 상한은 뷰포트 CSS 픽셀입니다.`);
    console.log("  규격 해상도는 screenshot 백엔드로만 나옵니다 (profiles.mjs의 backend).");
  }
  console.log(`· 산출물 ${Object.values(manifest.outputs).join(", ")}`);
  console.log(`· manifest capture-manifest.json`);
} finally {
  server?.stop();
}
