// 페이지에 주입하는 함수들. `addInitScript`로 넘기므로 **브라우저 안에서 단독으로 성립**해야 한다.
// 바깥 스코프의 변수를 잡으면 조용히 undefined가 되므로 상수도 안에 적는다.

/** 촬영본에 남으면 안 되는 요소들. 자체 점검(`assertCleanChrome`)도 같은 목록을 본다. */
export const captureChromeSelectors = {
  consentBanner: '[aria-label="분석 쿠키 동의"]',
  consentSettings: '[aria-label="분석 쿠키 설정"]',
  devIndicator: "nextjs-portal",
};

/**
 * 분석 동의를 미리 "거부"로 심는다(§2.6 3번).
 *
 * 동의 배너는 화면 하단을 덮는다. 촬영본에 들어가면 지울 방법이 없고, 실제로 프로토타입 첫 촬영이
 * 그 배너 때문에 통째로 못 쓰게 됐다. 값은 `lib/analytics/ga4.ts`의
 * `analyticsConsentStorageKey`/`AnalyticsConsent`와 같아야 한다 — 저 파일이 바뀌면 여기도 바꾼다.
 *
 * "거부"를 고르는 이유는 촬영이 GA4에 이벤트를 남기지 않게 하기 위해서다.
 *
 * **이것만으로는 부족하다.** 동의든 거부든 한 번 정해지면 `AnalyticsProvider`가 좌하단에 쿠키
 * 설정 버튼을 상주시킨다(`AnalyticsProvider.tsx:73`). 배너를 없앤 대가로 더 오래 남는 장식이
 * 생기는 셈이라, 아래 CSS가 둘 다 지운다.
 */
export function analyticsConsentDenied() {
  try {
    window.localStorage.setItem("talktheme:analytics-consent:v1", "denied");
  } catch {
    // 저장소를 막아 둔 컨텍스트면 배너가 뜰 수 있다. 촬영이 멈출 일은 아니다.
  }
}

/**
 * 촬영본에 남으면 안 되는 브라우저·개발·동의 장식을 지운다.
 *
 * - 분석 동의 배너와 쿠키 설정 버튼: 위 주석 참고. 촬영 서버의 `NEXT_PUBLIC_GA_MEASUREMENT_ID`가
 *   비어 있으면 애초에 렌더되지 않지만(`AnalyticsProvider.tsx:58`), `--server=`로 실제 앱에
 *   붙여 찍을 때는 그대로 나타난다.
 * - `nextjs-portal`: Next dev 표시등(§2.6 7번). 프로덕션 빌드로 찍으면 없지만, dev 서버로 빠르게
 *   확인할 때를 위해 남겨 둔다.
 * - 스크롤바: 화면 오른쪽에 회색 띠로 찍힌다. 폭을 0으로 만들어도 스크롤은 그대로 동작한다.
 *
 * `<head>`에 넣는다. `<body>`는 React 하이드레이션이 정리하면서 같이 지워질 수 있다(§2.6 4번).
 */
export function hideCaptureChromeCss() {
  const install = () => {
    const style = document.createElement("style");
    style.setAttribute("data-capture", "hide-chrome");
    style.textContent = `
      [aria-label="분석 쿠키 동의"],
      [aria-label="분석 쿠키 설정"],
      nextjs-portal { display: none !important; }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      html { scrollbar-width: none !important; }
    `;
    (document.head ?? document.documentElement).appendChild(style);
  };

  if (document.head) install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
}

/**
 * 위 장식이 정말로 화면에서 사라졌는지 확인한다.
 *
 * 이 함정들의 공통점은 **조용히 실패한다**는 것이다. 배너가 찍혀도 촬영은 끝까지 돌고, 다 만든
 * 뒤에야 프레임에서 발견된다. 씬이 끝날 때마다 확인해서 못 쓰는 영상을 끝까지 만들지 않는다.
 */
export async function assertCleanChrome(page, sceneId) {
  const found = [];
  for (const [name, selector] of Object.entries(captureChromeSelectors)) {
    // `.first().isVisible()`로는 안 된다. dev 서버는 자기 `nextjs-portal`을 크기 0으로 미리
    // 심어 두는데, 그게 첫 번째로 잡히면 뒤에 있는 **보이는** 요소를 영영 못 본다.
    // 실제로 이 점검이 3건 중 2건만 잡고 조용히 통과했다. 일치하는 것을 전부 본다.
    const visible = await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes.some((node) => {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      )
      .catch(() => false);
    if (visible) found.push(`${name} (${selector})`);
  }
  if (found.length) {
    throw new Error(
      `'${sceneId}' 씬 화면에 촬영에 남으면 안 되는 요소가 보입니다:\n  ${found.join("\n  ")}\n` +
        "  scripts/capture/pageSetup.mjs의 CSS가 이 선택자를 덮는지 확인하세요.",
    );
  }
}
