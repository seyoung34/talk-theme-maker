// 촬영 규격. 해상도 값은 전부 실측에 근거한다 — 추정한 숫자를 여기 적지 않는다.
//
// 실측으로 확정한 규칙 (뷰포트 1280x720 / deviceScaleFactor 1.5, 네 모서리 색으로 판정):
//
//   page.screenshot()          1920x1080  네 모서리 모두 정상        → dsf를 지키는 유일한 경로
//   recordVideo({ size })      1920x1080  좌상단만 그리고 #808080   → 패딩
//   page.screencast({ size })  1920x1080  좌상단만 그리고 #808080   → 패딩
//   page.screencast, size == 뷰포트                                 → 꽉 참
//
// 즉 **screencast의 실해상도는 뷰포트 CSS 픽셀이다.** `size`는 출력 컨테이너만 키우고 모자란
// 자리를 회색으로 채우며, `deviceScaleFactor`는 무시한다. `size`를 아예 주지 않으면 Playwright가
// 800px 상자에 맞춰 줄여 버리므로(1280x720 → 800x450), size는 뷰포트와 같은 값으로 **반드시** 준다.
//
// 그래서 1920x1080이나 1080x1920 풀블리드는 screenshot 백엔드로만 나온다.

/** @typedef {"screencast" | "screenshot"} CaptureBackend */

export const profiles = {
  guide: {
    id: "guide",
    label: "가이드 16:9",
    /**
     * screencast는 실시간 캡처라 rAF를 굶기지 않는다(§2.6 5번). 커서·클릭 강조·챕터 오버레이가
     * 내장이라 가이드에 필요한 연출이 그대로 나온다. 대신 해상도가 뷰포트에 묶인다.
     */
    backend: /** @type {CaptureBackend} */ ("screencast"),
    viewport: { width: 1280, height: 720 },
    // screencast는 무시하지만, backend를 screenshot으로 바꾸면 이 값이 해상도 배율이 된다.
    deviceScaleFactor: 1.5,
    // 이번 백엔드가 실제로 뱉는 크기. manifest에는 이 값이 아니라 **인코딩 후 실측값**을 적는다.
    capture: { width: 1280, height: 720 },
    // 문서 §6.1이 정한 배포 규격. 현재 백엔드로는 미달이며 그 사실을 manifest가 드러낸다.
    spec: { width: 1920, height: 1080 },
    fps: 30,
    isMobile: false,
    // 가이드는 색을 만지지 않는다. 제품 화면과 다르면 사용자가 자기 화면에서 같은 곳을 못 찾는다.
    toneDown: 0,
    // 자막을 영상에 굽지 않는다. 가이드 페이지가 DOM(`EasyAnnotation`)으로 그려서 문구 수정·번역·
    // 접근성을 살린다.
    captions: false,
    outputs: ["webm", "mp4", "poster"],
  },

  reel: {
    id: "reel",
    label: "홍보 릴스 9:16",
    // 9:16 풀블리드 1080x1920은 page.screenshot()만 낸다.
    backend: /** @type {CaptureBackend} */ ("screenshot"),
    // 432 x 2.5 = 1080, 768 x 2.5 = 1920. 정확히 9:16이다.
    viewport: { width: 432, height: 768 },
    deviceScaleFactor: 2.5,
    capture: { width: 1080, height: 1920 },
    spec: { width: 1080, height: 1920 },
    fps: 30,
    isMobile: true,
    /**
     * 1080x1920 JPEG 한 장에 약 52ms라 19fps가 상한이다. 30fps를 채우려면 페이지를 이만큼
     * 느리게 연출하고 인코딩에서 시간축을 되돌린다. 19 x 1.6 = 30.4fps.
     */
    slowdown: 1.6,
    // 배경 토큰만 내린다. 0이면 끈다. 값은 육안 QA로 정한다(계획서 §9 열린 질문).
    toneDown: 0,
    captions: true,
    outputs: ["mp4"],
  },
};

export function getProfile(id) {
  const profile = profiles[id];
  if (!profile) {
    throw new Error(`알 수 없는 프로필: ${id}. 가능한 값: ${Object.keys(profiles).join(", ")}`);
  }
  return profile;
}
