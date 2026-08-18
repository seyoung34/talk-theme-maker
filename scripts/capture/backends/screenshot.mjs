// 프레임 루프 캡처 백엔드. 릴스 9:16이 쓴다.
//
// `page.screenshot()`은 `deviceScaleFactor`를 지키는 **유일한** 경로라, 좁은 뷰포트를 유지한 채
// 1080x1920 풀블리드를 얻으려면 이 길밖에 없다(profiles.mjs의 실측표).
//
// 대가가 둘이다.
//
// 1. 실시간이 아니다. 1080x1920 JPEG 한 장에 약 52ms(`channel: "chromium"` 기준, 기본
//    `headless_shell`은 227ms)라 19fps가 상한이다. 그래서 페이지를 `slowdown`배 느리게 연출하고
//    인코딩에서 시간축을 같은 비율로 되돌린다. 실효 프레임 레이트가 19 x slowdown이 된다.
// 2. 스크린샷 루프가 렌더러를 점유해 `requestAnimationFrame`을 굶긴다(§2.6 5번). 시간으로 굴리는
//    연출은 여기서 무너진다 — 9.6초로 의도한 스크롤이 27초 걸린 적이 있다. 그래서 움직임은
//    시간이 아니라 **캡처된 프레임 단위로** 구동한다(`frameStep`).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function createScreenshotBackend({ profile, page, outDir }) {
  const framesDir = path.join(outDir, "frames");
  const slowdown = profile.slowdown ?? 1.6;
  const frames = [];
  const steppers = new Set();

  let running = false;
  let paused = false;
  let loop = null;
  let startedAt = 0;
  let pausedTotalMs = 0;
  let pausedAt = 0;
  let cdp = null;

  /** 멈춰 있던 시간을 뺀 촬영 시각. 안 빼면 그 구간이 정지 화면으로 영상에 남는다. */
  const stamp = () => (Date.now() - startedAt - pausedTotalMs) / 1000;

  /** 프레임 한 장을 찍은 **뒤** 구독자들에게 다음 상태를 만들 기회를 준다. */
  async function notifyFrame() {
    for (const stepper of [...steppers]) await stepper();
  }

  return {
    id: "screenshot",
    supportsFrameStep: true,
    // 멈춘 동안 프레임을 아예 만들지 않는다. 그 구간은 최종 영상에 남지 않는다.
    dropsPausedFrames: true,
    slowdown,

    async start() {
      await mkdir(framesDir, { recursive: true });

      // CSS 트랜지션과 @keyframes 애니메이션이 함께 느려진다(계획서 §2.2에서 4배로 실측).
      // 애니메이션을 끄지 않는 이유는 색이 바뀌는 순간 같은 움직임이 잘라낼 대상이 아니라
      // 보여주려는 내용 그 자체이기 때문이다.
      cdp = await page.context().newCDPSession(page);
      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slowdown });

      running = true;
      startedAt = Date.now();
      loop = (async () => {
        while (running) {
          if (paused) {
            await new Promise((resolve) => setTimeout(resolve, 30));
            continue;
          }
          const buffer = await page.screenshot({ type: "jpeg", quality: 92 }).catch(() => null);
          if (!buffer) continue;
          const t = stamp();
          const file = path.join(framesDir, `frame-${String(frames.length).padStart(6, "0")}.jpg`);
          await writeFile(file, buffer);
          frames.push({ file, t });
          await notifyFrame();
        }
      })();
    },

    /**
     * 카메라를 잠깐 내린다.
     *
     * 페이지 이동과 부트스트랩 대기가 그대로 찍히면 릴스 앞머리가 로딩 화면으로 몇 초씩
     * 날아간다. 15~30초짜리에서는 치명적이다. 멈춘 동안의 시간은 타임스탬프에서 빼므로
     * 최종 영상에 정지 구간으로 남지도 않는다.
     */
    /** 촬영 시각. 멈춰 있던 구간은 빠져 있다. */
    now: () => stamp(),

    pause() {
      if (paused) return;
      paused = true;
      pausedAt = Date.now();
    },

    resume() {
      if (!paused) return;
      paused = false;
      pausedTotalMs += Date.now() - pausedAt;
    },

    /**
     * 움직임을 캡처된 프레임 수로 구동한다.
     *
     * `fn(i, count)`이 프레임 한 장마다 정확히 한 번 불린다. 스크린샷이 얼마나 느리든 프레임이
     * 빠지지 않으므로, 촬영 머신의 속도와 무관하게 같은 결과가 나온다. 시간으로 굴렸을 때
     * 생기던 어긋남(§2.6 5번)이 여기서 사라진다.
     */
    frameStep(count, fn) {
      if (count <= 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        let index = 0;
        const stepper = async () => {
          try {
            await fn(index, count);
          } catch (error) {
            steppers.delete(stepper);
            reject(error);
            return;
          }
          index += 1;
          if (index >= count) {
            steppers.delete(stepper);
            resolve();
          }
        };
        steppers.add(stepper);
      });
    },

    async chapter(title, description) {
      await page.evaluate(
        ({ title, description }) => window.__capture?.chapter(title, description),
        { title, description },
      );
      // 챕터는 페이지 안 오버레이라 프레임 루프가 그대로 담는다. 배속만큼 실제로 기다린다.
      await page.waitForTimeout(1600 * (profile.slowdown ?? 1.6));
      await page.evaluate(() => window.__capture?.chapter(null));
    },

    async stop() {
      running = false;
      await loop?.catch(() => {});
      await cdp?.detach().catch(() => {});
      return { videoPath: null, frames, slowdown };
    },
  };
}
