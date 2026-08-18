// 캡처 러너. 브라우저를 띄우고, 촬영 함정 대응을 걸고, 씬을 순서대로 돌리며 경계 시각을 남긴다.
//
// 함정 대응은 **씬이 아니라 여기**에 둔다. 씬마다 각자 처리하면 새 씬을 쓸 때마다 빠뜨리고,
// 빠뜨린 티가 영상에서만 드러난다(§2.6에 기록된 것들이 전부 그렇게 발견됐다).
//
// 캡처 방식 자체는 `backends/`가 맡는다. 규격마다 해상도 상한이 달라 한 방식으로 둘 다 찍을 수
// 없기 때문이다(profiles.mjs의 실측표). 러너는 어느 백엔드든 같은 씬을 돌릴 수 있게 맞춘다.
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { analyticsConsentDenied, assertCleanChrome, hideCaptureChromeCss } from "./pageSetup.mjs";
import { applyToneDown, buildToneDownTokens, installCaptureOverlay, safeArea } from "./overlays.mjs";
import { framesToVideo, posterWebp, probeVideo, toMp4 } from "./encode.mjs";
import { createScreencastBackend } from "./backends/screencast.mjs";
import { createScreenshotBackend } from "./backends/screenshot.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

export const manifestSchemaVersion = 1;

const backendFactories = {
  screencast: createScreencastBackend,
  screenshot: createScreenshotBackend,
};

/** 연출 기본 박자. 120BPM 기준 0.5초. */
const beatMs = 500;

function appCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** 가감속. 등속으로 밀면 스크롤이 기계처럼 보인다. */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export async function runCapture({
  profile,
  scenes,
  baseURL,
  outDir,
  captureEnv = "mock",
  templateId = null,
  safeGuides = false,
  keepFrames = false,
}) {
  const createBackend = backendFactories[profile.backend];
  if (!createBackend) throw new Error(`알 수 없는 백엔드: ${profile.backend}`);

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "no-preference",
  });

  // §2.6 3번: 분석 동의 배너가 하단을 덮는다. 페이지 스크립트보다 먼저 심는다.
  await context.addInitScript(analyticsConsentDenied);
  // §2.6 7번(+동의 UI, 스크롤바): 촬영본에 남으면 안 되는 장식을 CSS로 지운다.
  await context.addInitScript(hideCaptureChromeCss);
  await context.addInitScript(installCaptureOverlay, { safeTop: safeArea.top, safeBottom: safeArea.bottom });
  if (profile.toneDown > 0) {
    await context.addInitScript(applyToneDown, buildToneDownTokens(profile.toneDown));
  }

  const page = await context.newPage();
  const backend = createBackend({ profile, page, outDir });

  // 이동할 때마다 DOM이 새로 그려진다. 가늠자는 그때마다 다시 켠다.
  if (safeGuides) {
    page.on("load", () => {
      page.evaluate(() => window.__capture?.safeAreas(true)).catch(() => {});
    });
  }

  /**
   * 프레임 단위 구동. 백엔드가 프레임을 직접 만들지 않으면(실시간 캡처) 목표 레이트에 맞춰
   * 시간으로 흉내 낸다. 씬 코드가 백엔드를 몰라도 되게 하려는 것이다.
   */
  const frameStep = backend.supportsFrameStep
    ? (count, fn) => backend.frameStep(count, fn)
    : async (count, fn) => {
        for (let index = 0; index < count; index += 1) {
          await fn(index, count);
          await page.waitForTimeout(1000 / profile.fps);
        }
      };

  /** 현재 씬에서 카메라를 내렸던 구간. 백엔드가 프레임을 버리지 못할 때만 쌓인다. */
  let deadSpans = [];

  const ctx = {
    page,
    baseURL,
    profile,
    /** 연출용 쉼. 배속 촬영 중에는 그만큼 실제로 더 기다려야 최종 영상에서 의도한 길이가 된다. */
    beat: (ms = beatMs) => page.waitForTimeout(ms * backend.slowdown),
    /** 움직임 없이 N프레임 머문다. 자막을 읽힐 때 쓴다. */
    hold: (frames) => frameStep(frames, () => {}),
    frameStep,
    dismissNotices: () => dismissNotices(page),

    /**
     * 카메라 밖에서 처리한다. 페이지 이동·부트스트랩 대기처럼 **보여줄 것이 없는 구간**을 감싼다.
     *
     * 감싸지 않으면 릴스 앞머리가 로딩 화면으로 몇 초 날아간다. 실제로 첫 촬영본의 3초 지점이
     * 아직 편집기를 그리는 중이었다.
     */
    async offCamera(fn) {
      const from = backend.now();
      backend.pause();
      try {
        return await fn();
      } finally {
        backend.resume();
        // 프레임을 실제로 버리는 백엔드는 그 구간이 영상에 없다. 기록할 것이 없다.
        // 버리지 못하는 백엔드(실시간 녹화)는 로딩 화면이 그대로 남으므로 위치를 남겨
        // 합성 쪽이 잘라낼 수 있게 한다.
        if (!backend.dropsPausedFrames) deadSpans.push([from, backend.now()]);
      }
    },
    caption: (text) => page.evaluate((value) => window.__capture?.caption(value), text ?? null),

    /**
     * 스크롤을 **캡처된 프레임 단위로** 굴린다(§2.6 5번).
     *
     * 시간으로 굴리면 스크린샷 루프가 렌더러를 점유해 requestAnimationFrame이 굶고, 9.6초로
     * 의도한 스크롤이 27초 걸린다. 프레임 수로 세면 촬영 머신이 느려도 결과가 같다.
     */
    async scrollTo(target, { frames = 45 } = {}) {
      const from = await page.evaluate(() => window.scrollY);
      const to =
        target === "bottom"
          ? await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
          : target === "top"
            ? 0
            : target;
      if (Math.abs(to - from) < 1) return;
      await frameStep(frames, (index, count) => {
        const progress = easeInOut((index + 1) / count);
        return page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * progress);
      });
    },
  };

  await backend.start();
  // 벽시계가 아니라 백엔드가 세는 촬영 시각이다. offCamera로 멈춘 구간이 빠져 있어야
  // 씬 경계가 최종 영상의 실제 지점을 가리킨다.
  const elapsed = () => backend.now();
  const clips = [];
  let captured = null;

  try {
    for (const scene of scenes) {
      await backend.chapter(scene.title, scene.description);

      deadSpans = [];
      const startSec = elapsed();
      await scene.run(ctx);
      const endSec = elapsed();

      // 함정들은 조용히 실패한다 — 배너가 찍혀도 촬영은 끝까지 돈다. 씬마다 확인해서 못 쓰는
      // 영상을 끝까지 만들지 않는다.
      await assertCleanChrome(page, scene.id);
      // 자막이 다음 씬으로 새지 않게 한다.
      await ctx.caption(null);

      clips.push({ scene: scene.id, title: scene.title, startSec, endSec, skip: deadSpans });
      console.log(`  ✓ ${scene.id.padEnd(20)} ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s`);
    }
  } finally {
    captured = await backend.stop().catch(() => null);
    await context.close();
    await browser.close();
  }

  const { outputs, primary, timeScale } = await materialize(captured, { profile, outDir, keepFrames });

  // clips가 가리키는 바로 그 파일을 잰다. 중간 산출물을 재고 배포본 경로를 적으면 manifest
  // 안에서 숫자와 파일이 서로 다른 것을 말하게 된다.
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
    clips: clips.map((clip) => ({
      ...clip,
      // 촬영 중 시각을 최종 영상의 시각으로 옮긴다. 배속으로 찍었으면 그만큼 앞당겨진다.
      startSec: Math.round((clip.startSec / timeScale) * 1000) / 1000,
      // 영상 길이를 넘지 않게 자른다. 마지막 프레임 길이 추정과 fps 재샘플링이 조금씩 달라
      // 그대로 두면 합성 쪽이 끝을 넘겨 자르려 한다.
      endSec: Math.min(measured.durationSec, Math.round((clip.endSec / timeScale) * 1000) / 1000),
      // 볼 것이 없는 구간. 합성 쪽은 여기를 잘라내고 이어 붙인다.
      skip: clip.skip.map(([from, to]) => [
        Math.round((from / timeScale) * 1000) / 1000,
        Math.round((to / timeScale) * 1000) / 1000,
      ]),
      path: path.basename(primary),
      source: "auto",
    })),
  };

  await writeFile(path.join(outDir, "capture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/** 백엔드가 남긴 원본(영상 파일 또는 프레임 묶음)을 배포 형식으로 만든다. */
async function materialize(captured, { profile, outDir, keepFrames }) {
  if (!captured) throw new Error("캡처가 원본을 남기지 못했습니다.");

  if (captured.frames) {
    const framesDir = path.dirname(captured.frames[0].file);
    const target = path.join(outDir, `${profile.id}.mp4`);
    await framesToVideo(captured.frames, target, {
      fps: profile.fps,
      slowdown: captured.slowdown,
      framesDir,
    });
    // 프레임은 금방 수백 MB가 된다. 다시 인코딩할 일이 있을 때만 남긴다.
    if (!keepFrames) await rm(framesDir, { recursive: true, force: true });
    return { outputs: { mp4: path.basename(target) }, primary: target, timeScale: captured.slowdown };
  }

  const outputs = { webm: path.basename(captured.videoPath) };
  let primary = captured.videoPath;
  if (profile.outputs.includes("mp4")) {
    primary = await toMp4(captured.videoPath, path.join(outDir, `${profile.id}.mp4`));
    outputs.mp4 = path.basename(primary);
  }
  if (profile.outputs.includes("poster")) {
    outputs.poster = path.basename(await posterWebp(captured.videoPath, path.join(outDir, `${profile.id}-poster.webp`)));
  }
  return { outputs, primary, timeScale: 1 };
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
