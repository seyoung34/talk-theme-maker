// 실시간 캡처 백엔드. 가이드 16:9가 쓴다.
//
// 커서·클릭 강조·챕터가 전부 내장이고 렌더러를 굶기지 않는다. 대신 **해상도가 뷰포트 CSS
// 픽셀에 묶인다** — `size`는 출력 컨테이너만 키우고 `deviceScaleFactor`는 무시한다(profiles.mjs).
import path from "node:path";

export function createScreencastBackend({ profile, page, outDir }) {
  const videoPath = path.join(outDir, `${profile.id}.webm`);
  let actions = null;
  let startedAt = 0;

  return {
    id: "screencast",
    // 프레임을 우리가 만들지 않으므로 프레임 단위 구동을 제공할 수 없다.
    supportsFrameStep: false,
    // 실시간 녹화라 멈출 수 없다. 로딩 구간이 영상에 그대로 남으므로 manifest가 위치를 알려준다.
    dropsPausedFrames: false,
    // showActions가 커서와 클릭 강조를 브라우저 바깥에서 그린다. 우리가 또 그리면 두 개가 된다.
    drawsCursor: true,
    // 실시간이라 배속 촬영이 필요 없다. 연출 시간을 늘리지 않는다.
    slowdown: 1,

    async start() {
      // §2.6 4번: 커서를 직접 주입하면 `<html>` 직속은 렌더되지 않고 `<body>`에 넣으면
      // 하이드레이션이 지운다. showActions는 브라우저 바깥에서 그리므로 그 문제가 없다.
      actions = await page.screencast.showActions({ cursor: "pointer", duration: 700, position: "top-right" });
      // size는 뷰포트와 같은 값으로 준다. 생략하면 800px 상자로 줄고, 키우면 회색 패딩이 붙는다.
      await page.screencast.start({ path: videoPath, size: profile.capture, quality: 92 });
      startedAt = Date.now();
    },

    now: () => (Date.now() - startedAt) / 1000,

    /**
     * 실시간 캡처라 멈출 수 없다. 무동작으로 둔다.
     *
     * 씬 코드가 백엔드를 몰라도 되게 하려는 것이다. 가이드는 로딩 구간이 남아도 릴스만큼
     * 치명적이지 않고(길이 제약이 느슨하다), 필요하면 manifest의 씬 경계로 잘라 쓴다.
     */
    pause() {},
    resume() {},

    async chapter(title, description) {
      await page.screencast.showChapter(title, { description, duration: 1600 });
      await page.waitForTimeout(1700);
    },

    async stop() {
      await page.screencast.stop();
      await actions?.dispose().catch(() => {});
      return { videoPath, frames: null };
    },
  };
}
