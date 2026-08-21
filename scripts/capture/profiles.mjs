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
     * screenshot 백엔드를 쓴다. 규격(1920x1080)에 도달하는 유일한 길이면서, 커서도 함께 얻는다.
     *
     * screencast의 `showActions`가 커서를 내장하지만 해상도가 뷰포트 CSS 픽셀에 묶여 1280x720이
     * 상한이다. 둘 중 하나를 고르는 문제로 보였는데, 커서를 자막과 같은 방식으로 DOM에 직접
     * 그리면(overlays.mjs) 양쪽을 다 가진다. **가이드에 커서는 선택이 아니다** — 어디를 누르는지
     * 보이지 않으면 보는 사람이 자기 화면에서 같은 곳을 찾을 수 없다.
     */
    backend: /** @type {CaptureBackend} */ ("screenshot"),
    viewport: { width: 1280, height: 720 },
    // 1280 x 1.5 = 1920, 720 x 1.5 = 1080.
    deviceScaleFactor: 1.5,
    capture: { width: 1920, height: 1080 },
    spec: { width: 1920, height: 1080 },
    fps: 30,
    isMobile: false,
    /**
     * 1920x1080 JPEG 한 장에 드는 시간이 릴스(1080x1920)와 비슷하다. 같은 배속을 쓴다.
     */
    slowdown: 1.6,
    // 가이드는 색을 만지지 않는다. 제품 화면과 다르면 사용자가 자기 화면에서 같은 곳을 못 찾는다.
    toneDown: 0,
    // 자막과 챕터를 영상에 굽지 않는다. 가이드 페이지가 스텝 제목·설명·`EasyAnnotation`을 DOM으로
    // 그리므로 영상에 또 얹으면 같은 말이 두 번 나오고, 문구를 고칠 때마다 다시 찍어야 한다.
    captions: false,
    chapters: false,
    // 스텝마다 별도 파일이 필요하다. `EasyStep.media.src`가 파일 하나를 가리키기 때문이다.
    splitScenes: true,
    // screenshot 백엔드는 프레임에서 바로 mp4를 만든다. webm 경로는 없다.
    outputs: ["mp4", "poster"],
    // content.ts의 `media.aspect` 기본값과 같은 값. 어긋나면 카드가 조용히 잘라낸다.
    aspect: "16 / 9",
  },

  "guide-mobile": {
    id: "guide-mobile",
    label: "가이드 모바일 9:16",
    /**
     * 모바일 편집기를 세로로 찍는다.
     *
     * 폰으로 가이드를 보는 사람은 대개 폰으로 편집도 한다. 데스크톱 편집기 화면을 390px 폭
     * 카드에 넣으면 글자를 읽을 수 없고, 읽었더라도 자기 화면에 없는 UI라 따라 할 수가 없다.
     * `EasyStep.mobileMedia`가 이 클립을 받고, 카드는 아래 비율을 그대로 따른다.
     */
    backend: /** @type {CaptureBackend} */ ("screenshot"),
    // 432 x 2.5 = 1080, 768 x 2.5 = 1920. 릴스와 같은 뷰포트라 변수를 하나 줄인다.
    viewport: { width: 432, height: 768 },
    deviceScaleFactor: 2.5,
    capture: { width: 1080, height: 1920 },
    spec: { width: 1080, height: 1920 },
    fps: 30,
    isMobile: true,
    slowdown: 1.6,
    // 가이드는 색을 만지지 않는다. 제품 화면과 다르면 사용자가 자기 화면에서 같은 곳을 못 찾는다.
    toneDown: 0,
    // 스텝 제목·설명은 가이드 페이지가 DOM으로 그린다. 영상에 또 얹지 않는다.
    captions: false,
    chapters: false,
    splitScenes: true,
    outputs: ["mp4", "poster"],
    // content.ts의 `mobileMedia.aspect`에 그대로 적을 값.
    aspect: "9 / 16",
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
    chapters: true,
    // 릴스는 한 편으로 이어 붙여 내보낸다. 씬 경계는 manifest가 알려준다.
    splitScenes: false,
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
