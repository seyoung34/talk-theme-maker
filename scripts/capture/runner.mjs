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
import { signInLocalUser } from "./scenes/shared.mjs";
import { applyToneDown, buildToneDownTokens, installCaptureOverlay, safeArea } from "./overlays.mjs";
import { framesToVideo, posterWebp, probeVideo, toMp4, trimVideo } from "./encode.mjs";
import { assertSceneExpectation } from "./verify.mjs";
import { createScreencastBackend } from "./backends/screencast.mjs";
import { createScreenshotBackend } from "./backends/screenshot.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

export const manifestSchemaVersion = 1;

const backendFactories = {
  screencast: createScreencastBackend,
  screenshot: createScreenshotBackend,
};

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

  // 직접 그리는 커서의 현재 위치. 화면 아래쪽에서 시작해 첫 이동이 자연스럽게 보이게 한다.
  let cursorAt = { x: profile.viewport.width * 0.5, y: profile.viewport.height * 0.86 };

  /** 커서를 목표 지점까지 **프레임 단위로** 옮긴다. 마지막에 실제 좌표를 기억한다. */
  async function moveCursor(to, frames) {
    const from = cursorAt;
    // 폰 화면에 마우스 화살표를 그리면 실제로 없는 입력 장치를 가르치게 된다. 모양만 바꾸고
    // 움직임은 똑같이 준다 — 누르기 전에 어디로 가는지 보이는 것이 요점이기 때문이다.
    const kind = profile.isMobile ? "touch" : "pointer";
    await frameStep(frames, (index, count) => {
      const progress = easeInOut((index + 1) / count);
      const at = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, kind };
      return page.evaluate((pos) => window.__capture?.cursor(pos), at);
    });
    cursorAt = to;
  }

  /** 요소의 사각형. 화면 밖이면 먼저 굴려 올린다. */
  async function rectOf(locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    const box = await locator.boundingBox();
    if (!box) throw new Error("클릭 대상의 위치를 잡지 못했습니다. 화면에 보이는 요소인지 확인하세요.");
    return box;
  }

  const centerOfRect = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

  /**
   * 강조 박스를 씌우고 커서를 그 위로 옮긴다.
   *
   * 박스를 **커서보다 먼저** 그린다. 커서가 도착한 뒤에 그리면 이미 다 본 자리를 뒤늦게 감싸는
   * 꼴이라, 시선을 이끈다는 목적이 사라진다.
   */
  async function leadTo(locator, moveSeconds) {
    const box = await rectOf(locator);
    if (profile.highlights) {
      await page.evaluate((rect) => window.__capture?.highlight(rect), {
        x: box.x, y: box.y, width: box.width, height: box.height,
      });
      // 박스가 먼저 눈에 들어올 틈. 이것이 없으면 커서와 동시에 나타나 앞서 알리는 값이 없다.
      await page.waitForTimeout(180 * backend.slowdown);
    }
    const target = centerOfRect(box);
    await moveCursor(target, Math.max(2, Math.round(moveSeconds * profile.fps)));
    return target;
  }

  const clearHighlight = () =>
    profile.highlights ? page.evaluate(() => window.__capture?.highlight(null)) : Promise.resolve();

  const ctx = {
    page,
    baseURL,
    profile,
    /**
     * 이 씬이 어느 플랫폼 편집기를 찍는지. 씬이 선언하지 않으면 Android다.
     *
     * 편집기에 플랫폼 전환 UI가 없어서 진입 경로가 갈린다 — iOS는 갤러리에서 "iOS로 시작"을
     * 눌러야 하고, 그 선택이 편집기 세션에 남는다.
     */
    platform: "android",
    /**
     * 움직임 없이 머문다. **단위는 최종 영상 기준 초다.**
     *
     * 프레임 수로 세면 안 된다. 최종 길이는 프레임 개수가 아니라 **촬영 시각**으로 정해지므로,
     * 촬영이 느린 환경(dev 서버는 프로덕션 빌드보다 훨씬 느리다)에서 같은 프레임 수가 훨씬 긴
     * 영상이 된다. 실제로 6초로 의도한 스텝이 13초로 나왔다. 시간으로 기다리면 촬영 속도와
     * 무관하게 의도한 길이가 나온다 — 배속만큼 더 기다리고, 인코딩이 그만큼 되돌린다.
     */
    hold: (seconds) => page.waitForTimeout(seconds * 1000 * backend.slowdown),
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
    // 프로필이 자막을 끄면 씬이 불러도 아무것도 그리지 않는다. 끄고 켜는 판단을 씬마다 하게
    // 두면 프로필 설정이 있으나 마나 해진다.
    caption: (text) =>
      profile.captions ? page.evaluate((value) => window.__capture?.caption(value), text ?? null) : Promise.resolve(),

    /**
     * 커서를 보여주며 누른다. **가이드 영상의 핵심 동작이다** — 어디를 누르는지 보이지 않으면
     * 보는 사람이 자기 화면에서 같은 곳을 찾을 수 없다.
     *
     * 커서를 스스로 그리는 백엔드에서는 직접 옮기고 파문을 찍는다. `showActions`가 있는
     * 백엔드에서는 그쪽이 이미 그리므로 클릭만 한다 — 안 그러면 커서가 두 개로 보인다.
     */
    async click(locator, { moveSeconds = 0.5, settleSeconds = 0.35 } = {}) {
      if (backend.drawsCursor) {
        await locator.click();
        return;
      }
      // 움직임은 프레임으로 나눈다 — 부드러움은 프레임 개수가 정하기 때문이다. 길이가 촬영
      // 속도에 따라 조금 흔들리지만 0.5초짜리라 티가 나지 않는다.
      const target = await leadTo(locator, moveSeconds);
      await page.evaluate((pos) => window.__capture?.ripple(pos.x, pos.y), target);
      await locator.click();
      /*
       * 박스는 **누른 즉시** 지운다.
       *
       * 대기 뒤에 지우면 결과가 나타나는 자리를 박스가 0.35초(약 10프레임) 더 덮고 있다가
       * 사라진다. 눌렀다는 사실은 파문이 이미 표시했으므로 박스가 더 남을 이유가 없고,
       * 남아 있으면 바뀐 화면을 가린 채 뒤늦게 걷히는 것으로 보인다.
       */
      await clearHighlight();
      // 누른 결과가 화면에 나타날 시간을 준다. 바로 다음 동작으로 넘어가면 무엇이 바뀌었는지 안 보인다.
      await page.waitForTimeout(settleSeconds * 1000 * backend.slowdown);
    },

    /** 누르지 않고 가리키기만 한다. 어디를 볼지 안내할 때. */
    async point(locator, { moveSeconds = 0.5 } = {}) {
      if (backend.drawsCursor) return;
      await leadTo(locator, moveSeconds);
    },

    /** 가리키던 박스를 지운다. 누르지 않고 짚기만 한 뒤 넘어갈 때 쓴다. */
    unpoint: () => clearHighlight(),

    /**
     * 스크롤을 **캡처된 프레임 단위로** 굴린다(§2.6 5번).
     *
     * 시간으로 굴리면 스크린샷 루프가 렌더러를 점유해 requestAnimationFrame이 굶고, 9.6초로
     * 의도한 스크롤이 27초 걸린다. 프레임 수로 세면 촬영 머신이 느려도 결과가 같다.
     */
    async scrollTo(target, { seconds = 1.5 } = {}) {
      const frames = Math.max(2, Math.round(seconds * profile.fps));
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

  /**
   * 로컬 환경에서는 촬영 전에 로그인해 둔다.
   *
   * 카메라를 켜기 **전에** 한다. 로그인 화면은 어느 스텝의 내용도 아니고, 세션은 컨텍스트에
   * 남으므로 한 번이면 모든 씬이 로그인 상태로 돈다. `mock`은 Supabase를 비워 두므로 건너뛴다.
   *
   * 실패해도 촬영은 계속한다. 로그인이 꼭 필요한 씬(내보내기)은 스스로 던지고, 나머지 씬은
   * 비로그인으로도 성립한다 — 여기서 멈추면 멀쩡히 찍을 수 있는 것까지 못 찍는다.
   */
  if (captureEnv === "local") {
    const signedIn = await signInLocalUser(page, baseURL).catch((error) => {
      console.warn(`! 로그인하지 못했습니다: ${error.message.split(/\r?\n/)[0]}`);
      return false;
    });
    console.log(signedIn ? "· 로컬 계정으로 로그인함" : "! 비로그인 상태로 촬영합니다");
  }

  await backend.start();
  // 벽시계가 아니라 백엔드가 세는 촬영 시각이다. offCamera로 멈춘 구간이 빠져 있어야
  // 씬 경계가 최종 영상의 실제 지점을 가리킨다.
  const elapsed = () => backend.now();
  const clips = [];
  let captured = null;

  try {
    for (const scene of scenes) {
      /**
       * 챕터 카드는 프로필이 켠 경우에만 그린다.
       *
       * 이 조건이 없어서 가이드 클립 앞머리에 제목 카드가 구워졌다. 가이드 프로필은 스텝
       * 제목·설명을 가이드 페이지가 DOM으로 그리므로 `chapters: false`로 꺼 두는데, 러너가
       * 프로필을 보지 않고 항상 불렀다. 같은 말이 영상과 카드에 두 번 나오고, 문구를 고칠
       * 때마다 영상을 다시 찍어야 하는 상태였다.
       *
       * 켜져 있을 때만 부르면 배속만큼 기다리는 2.5초도 함께 사라진다.
       */
      ctx.platform = scene.platform ?? "android";
      if (profile.chapters) await backend.chapter(scene.title, scene.description);

      deadSpans = [];
      const startSec = elapsed();
      await scene.run(ctx);
      const endSec = elapsed();

      // 함정들은 조용히 실패한다 — 배너가 찍혀도 촬영은 끝까지 돈다. 씬마다 확인해서 못 쓰는
      // 영상을 끝까지 만들지 않는다.
      await assertCleanChrome(page, scene.id);
      // 자막과 강조 박스가 다음 씬으로 새지 않게 한다.
      await ctx.caption(null);
      await clearHighlight();

      // `expect`를 클립에 실어 보낸다. 인코딩 뒤에 검사해야 배포될 파일 그 자체를 재게 된다.
      clips.push({ scene: scene.id, title: scene.title, startSec, endSec, skip: deadSpans, expect: scene.expect });
      console.log(`  ✓ ${scene.id.padEnd(20)} ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s`);
    }
  } finally {
    captured = await backend.stop().catch(() => null);
    await context.close();
    await browser.close();
  }

  // clips가 가리키는 바로 그 파일을 잰다. 중간 산출물을 재고 배포본 경로를 적으면 manifest
  // 안에서 숫자와 파일이 서로 다른 것을 말하게 된다.
  const { outputs, measured, timeScale, clipOutputs } = await materialize(captured, {
    profile,
    outDir,
    keepFrames,
    clips,
  });

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
    // 스텝마다 파일이 따로 나가는지 여부. 소비자가 path를 어떻게 읽어야 하는지 결정한다.
    splitScenes: Boolean(profile.splitScenes),
    clips: clips.map((clip, index) => {
      const own = clipOutputs?.[index];
      const scale = (value) => Math.round((value / timeScale) * 1000) / 1000;
      // 분리 모드에서는 파일이 그 씬 하나뿐이라 시각이 0에서 시작한다. 이어 붙인 모드에서는
      // 촬영 시각을 최종 영상 시각으로 옮기고, 마지막 프레임 추정과 fps 재샘플링 차이 때문에
      // 끝이 길이를 넘지 않도록 자른다.
      const span = own
        ? { startSec: 0, endSec: own.measured.durationSec }
        : { startSec: scale(clip.startSec), endSec: Math.min(measured.durationSec, scale(clip.endSec)) };
      return {
        scene: clip.scene,
        title: clip.title,
        ...span,
        // 볼 것이 없는 구간. 합성 쪽은 여기를 잘라내고 이어 붙인다.
        skip: clip.skip.map(([from, to]) => [scale(from), scale(to)]),
        path: own ? own.path : outputs.mp4 ?? outputs.webm,
        ...(own?.poster ? { poster: own.poster } : {}),
        ...(own ? { measured: own.measured } : {}),
        source: "auto",
      };
    }),
  };

  await writeFile(path.join(outDir, "capture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/**
 * 백엔드가 남긴 원본(영상 파일 또는 프레임 묶음)을 배포 형식으로 만든다.
 *
 * `splitScenes` 프로필은 **씬마다 파일을 따로** 낸다. 가이드가 그렇다 —
 * `EasyStep.media.src`가 파일 하나를 가리키므로, 한 편으로 이어 붙이면 스텝에 꽂을 수가 없다.
 */
async function materialize(captured, { profile, outDir, keepFrames, clips }) {
  if (!captured) throw new Error("캡처가 원본을 남기지 못했습니다.");

  const timeScale = captured.frames ? captured.slowdown : 1;

  if (profile.splitScenes) {
    const clipOutputs = [];
    for (const clip of clips) {
      const name = `${profile.id}-${clip.scene}`;
      const target = path.join(outDir, `${name}.mp4`);
      await cutScene(captured, clip, target, profile);

      const own = { path: path.basename(target), measured: await probeVideo(target) };
      if (profile.outputs.includes("poster")) {
        own.poster = path.basename(await posterWebp(target, path.join(outDir, `${name}-poster.webp`), { atSec: 0.2 }));
      }
      // 씬이 "무엇이 보여야 하는가"를 선언했으면 여기서 확인한다. 인코딩이 끝난 **배포될 그
      // 파일**을 재야 한다 — 중간 산출물을 재면 실제로 나가는 것과 다른 것을 검사하게 된다.
      const observed = await assertSceneExpectation(clip.expect, clip.scene, target, own.measured);
      clipOutputs.push(own);
      const changeNote = observed === null ? "" : `  변화 ${(observed * 100).toFixed(0)}%`;
      console.log(`  · ${own.path.padEnd(34)} ${own.measured.width}x${own.measured.height} ${own.measured.durationSec}초${changeNote}`);
    }

    await cleanupFrames(captured, keepFrames);
    if (!clipOutputs.length) throw new Error("씬이 없어 산출물을 만들지 못했습니다.");
    return {
      outputs: Object.fromEntries(clipOutputs.map((own, index) => [clips[index].scene, own.path])),
      // 씬마다 파일이 다르므로 대표값으로 첫 파일을 잰다. 프로필이 같아 크기·레이트는 모두 같다.
      measured: clipOutputs[0].measured,
      timeScale,
      clipOutputs,
    };
  }

  if (captured.frames) {
    const target = path.join(outDir, `${profile.id}.mp4`);
    await framesToVideo(captured.frames, target, {
      fps: profile.fps,
      slowdown: captured.slowdown,
      framesDir: path.dirname(captured.frames[0].file),
    });
    await cleanupFrames(captured, keepFrames);
    return { outputs: { mp4: path.basename(target) }, measured: await probeVideo(target), timeScale, clipOutputs: null };
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
  return { outputs, measured: await probeVideo(primary), timeScale, clipOutputs: null };
}

/** 씬 하나만 잘라 낸다. 프레임을 가진 백엔드는 골라 담고, 영상 파일뿐이면 시간으로 자른다. */
async function cutScene(captured, clip, target, profile) {
  if (captured.frames) {
    const frames = captured.frames.filter((frame) => frame.t >= clip.startSec && frame.t <= clip.endSec);
    if (frames.length < 2) {
      throw new Error(`'${clip.scene}' 씬의 프레임이 ${frames.length}장뿐입니다. 씬이 너무 짧거나 전부 offCamera였습니다.`);
    }
    await framesToVideo(frames, target, {
      fps: profile.fps,
      slowdown: captured.slowdown,
      framesDir: path.dirname(captured.frames[0].file),
    });
    return;
  }
  await trimVideo(captured.videoPath, target, { startSec: clip.startSec, endSec: clip.endSec });
}

/** 프레임은 금방 수백 MB가 된다. 다시 인코딩할 일이 있을 때만 남긴다. */
async function cleanupFrames(captured, keepFrames) {
  if (!captured.frames || keepFrames) return;
  await rm(path.dirname(captured.frames[0].file), { recursive: true, force: true });
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
