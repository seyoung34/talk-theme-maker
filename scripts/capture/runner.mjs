// 캡처 러너. 브라우저를 띄우고, 촬영 함정 대응을 걸고, 씬을 순서대로 돌리며 경계 시각을 남긴다.
//
// 함정 대응은 **씬이 아니라 여기**에 둔다. 씬마다 각자 처리하면 새 씬을 쓸 때마다 빠뜨리고,
// 빠뜨린 티가 영상에서만 드러난다(§2.6에 기록된 것들이 전부 그렇게 발견됐다).
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { analyticsConsentDenied, assertCleanChrome, hideCaptureChromeCss } from "./pageSetup.mjs";
import { posterWebp, probeVideo, toMp4 } from "./encode.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

export const manifestSchemaVersion = 1;

function appCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * 씬 하나를 실행하는 동안 러너가 넘겨주는 도구.
 *
 * @typedef {object} SceneContext
 * @property {import("@playwright/test").Page} page
 * @property {string} baseURL
 * @property {(ms: number) => Promise<void>} beat  연출용 쉼. 배속 촬영이 붙으면 여기만 고치면 된다.
 * @property {() => Promise<void>} dismissNotices  편집기 진입 토스트를 걷어낸다(§2.6 6번).
 */

/**
 * @typedef {object} Scene
 * @property {string} id
 * @property {string} title        챕터 오버레이 제목
 * @property {string} [description]
 * @property {(ctx: SceneContext) => Promise<void>} run
 */

/** 연출 기본 박자. 120BPM 기준 0.5초. */
const beatMs = 500;

export async function runCapture({ profile, scenes, baseURL, outDir, captureEnv = "mock", templateId = null }) {
  if (profile.backend !== "screencast") {
    throw new Error(
      `'${profile.id}' 프로필의 백엔드 '${profile.backend}'는 아직 없습니다.\n` +
        "  page.screenshot() 루프 백엔드는 Phase B2 범위입니다(9:16 풀블리드는 그 경로로만 나옵니다).",
    );
  }

  await mkdir(outDir, { recursive: true });
  const webmPath = path.join(outDir, `${profile.id}.webm`);

  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // 촬영본에 재생 컨트롤이나 접근성 배지가 끼어들지 않게 축소 모션은 끄고 간다.
    reducedMotion: "no-preference",
  });

  // §2.6 3번: 분석 동의 배너가 하단을 덮는다. 페이지 스크립트보다 먼저 심는다.
  await context.addInitScript(analyticsConsentDenied);
  // §2.6 7번(+동의 UI, 스크롤바): 촬영본에 남으면 안 되는 장식을 CSS로 지운다.
  await context.addInitScript(hideCaptureChromeCss);

  const page = await context.newPage();

  /** @type {SceneContext} */
  const ctx = {
    page,
    baseURL,
    beat: (ms = beatMs) => page.waitForTimeout(ms),
    dismissNotices: () => dismissNotices(page),
  };

  // §2.6 4번: 커서를 직접 주입하면 `<html>` 직속은 렌더되지 않고 `<body>`에 넣으면 하이드레이션이
  // 지운다. showActions는 브라우저 바깥에서 그리므로 그 문제 자체가 없다.
  const actions = await page.screencast.showActions({ cursor: "pointer", duration: 700, position: "top-right" });

  // size는 뷰포트와 같은 값으로 준다. 생략하면 800px 상자로 줄고, 키우면 회색 패딩이 붙는다.
  await page.screencast.start({ path: webmPath, size: profile.capture, quality: 92 });

  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) * 10) / 10 / 1000;
  const clips = [];

  try {
    for (const scene of scenes) {
      await page.screencast.showChapter(scene.title, { description: scene.description, duration: 1600 });
      await page.waitForTimeout(1700);

      const startSec = elapsed();
      await scene.run(ctx);
      const endSec = elapsed();

      // 함정들은 조용히 실패한다 — 배너가 찍혀도 촬영은 끝까지 돈다. 씬마다 확인해서 못 쓰는
      // 영상을 끝까지 만들지 않는다.
      await assertCleanChrome(page, scene.id);

      clips.push({ scene: scene.id, title: scene.title, startSec, endSec });
      console.log(`  ✓ ${scene.id.padEnd(20)} ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s`);
    }
  } finally {
    await page.screencast.stop();
    await actions.dispose().catch(() => {});
    await context.close();
    await browser.close();
  }

  const outputs = { webm: path.basename(webmPath) };
  let primary = webmPath;
  if (profile.outputs.includes("mp4")) {
    primary = await toMp4(webmPath, path.join(outDir, `${profile.id}.mp4`));
    outputs.mp4 = path.basename(primary);
  }
  if (profile.outputs.includes("poster")) {
    outputs.poster = path.basename(await posterWebp(webmPath, path.join(outDir, `${profile.id}-poster.webp`)));
  }

  // clips가 가리키는 바로 그 파일을 잰다. 중간 산출물(webm)을 재고 배포본(mp4) 경로를 적으면
  // manifest 안에서 숫자와 파일이 서로 다른 것을 말하게 된다.
  const measured = await probeVideo(primary);

  const manifest = {
    schemaVersion: manifestSchemaVersion,
    appCommit: appCommit(),
    profile: profile.id,
    captureEnv,
    templateId,
    capturedAt: new Date().toISOString(),
    backend: profile.backend,
    // 의도가 아니라 실제로 나온 값이다. 백엔드가 뷰포트에 묶여 있어 둘이 갈릴 수 있고,
    // 여기에 의도한 값을 적으면 manifest가 거짓말을 하게 된다.
    measured,
    spec: profile.spec,
    meetsSpec: measured.width >= profile.spec.width && measured.height >= profile.spec.height,
    outputs,
    clips: clips.map((clip) => ({ ...clip, path: outputs.mp4 ?? outputs.webm, source: "auto" })),
  };

  await writeFile(path.join(outDir, "capture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/**
 * 편집기 진입 직후 뜨는 토스트를 걷어낸다(§2.6 6번).
 *
 * 2.5초면 저절로 사라지지만(`noticeAutoDismissMs`), 행동이 붙은 알림은 사라지지 않는다.
 * 기다리는 대신 닫기를 눌러 촬영 길이가 알림 종류에 따라 흔들리지 않게 한다.
 */
async function dismissNotices(page) {
  const close = page.getByRole("button", { name: "알림 닫기" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!(await close.first().isVisible().catch(() => false))) return;
    await close.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
}
