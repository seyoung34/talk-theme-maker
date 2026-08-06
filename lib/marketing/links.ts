/**
 * 홍보 링크와 캠페인 대장(臺帳).
 *
 * 여기가 **유일한 기록처**다. 어떤 링크를 어디에 뿌렸고 그 캠페인이 무슨 뜻이었는지를 반년 뒤에
 * 되짚을 수 있어야 한다. GA4 보고서에는 `launch_2608` 같은 코드만 남고 의미는 남지 않는다.
 *
 * 캠페인을 바꿀 때는 `campaigns`에 새 항목을 추가하고 `marketingLinks`의 `campaign`만 옮긴다.
 * **끝난 캠페인 항목은 지우지 않는다.** 과거 데이터를 해석하려면 그 뜻이 계속 필요하다.
 */

export type MarketingCampaign = {
  /** 사람이 읽는 이름. */
  readonly label: string;
  /** 시작일(YYYY-MM-DD). 지표를 기간으로 자를 때 기준이 된다. */
  readonly startedOn: string;
  /** 끝났으면 종료일. 진행 중이면 `null`. */
  readonly endedOn: string | null;
  /** 이 캠페인을 왜 나눴는지, 지표를 볼 때 무엇을 조심해야 하는지. */
  readonly note: string;
};

/**
 * 캠페인 코드는 `<목적>_<YYMM>` 형태로 짓는다. 날짜가 없으면 반년 뒤에 언제 것인지 알 수 없고,
 * 같은 채널에 두 번째 활동을 올릴 때 구분이 사라진다.
 */
export const campaigns: Record<string, MarketingCampaign> = {
  friends_test: {
    label: "지인 테스트",
    startedOn: "2026-08-07",
    endedOn: null,
    note:
      "공개 홍보 전 측근에게 먼저 뿌려 반응·이탈 지점을 본다. 이미 아는 사람이라 전환율이 "
      + "비정상적으로 높게 나온다. 이 수치를 공개 홍보 성과와 같은 표에 놓으면 채널 판단이 "
      + "왜곡되므로 반드시 분리해서 본다.",
  },
  launch_2608: {
    label: "8월 공개 런칭",
    startedOn: "2026-08-07",
    endedOn: null,
    note:
      "지인 테스트에서 문제가 정리된 뒤 시작하는 공개 홍보. friends_test 의 후속이며 같은 링크 "
      + "코드를 그대로 쓰고 캠페인만 이 값으로 옮긴다. 채널 간 비교는 이 캠페인부터 유효하다.",
  },
};

export type MarketingLink = {
  /** 리다이렉트할 서비스 내 경로. */
  readonly path: string;
  readonly source: string;
  /** GA4 채널 그룹이 알아듣는 값이어야 한다. `lib/analytics/ga4.ts`의 별칭 표 참조. */
  readonly medium: string;
  readonly campaign: keyof typeof campaigns;
  /** 이 코드를 실제로 어디에 붙였는지. */
  readonly placement: string;
};

/**
 * 단축 코드는 짧게 짓는다. 인스타 바이오·카카오톡·문자·QR에서 길이가 곧 불리함이다.
 *
 * **코드는 고정하고 목적지와 캠페인만 바꾼다.** 인스타 프로필에 링크를 한 번 걸어두면 캠페인이
 * 바뀌어도 다시 올릴 필요가 없다. 이것이 UTM 원본 링크 대신 단축 링크를 두는 가장 큰 실익이다.
 */
export const marketingLinks: Record<string, MarketingLink> = {
  ig: {
    path: "/",
    source: "instagram",
    medium: "social",
    campaign: "friends_test",
    placement: "개인 인스타그램 프로필 링크와 게시물",
  },
  dm: {
    path: "/",
    source: "direct_share",
    // 카카오톡·문자로 보낸 링크는 리퍼러가 비어 GA4가 Direct 로 잡는다. 표시를 붙여야 구분된다.
    medium: "referral",
    campaign: "friends_test",
    placement: "카카오톡·문자로 직접 전달",
  },
  yt: {
    path: "/",
    source: "youtube",
    medium: "video",
    campaign: "launch_2608",
    placement: "유튜브 영상 설명란",
  },
  cm: {
    path: "/",
    source: "community",
    medium: "referral",
    campaign: "launch_2608",
    placement: "커뮤니티·오픈채팅 게시글",
  },
  nv: {
    path: "/",
    source: "naver",
    // 검색 결과 자체에는 UTM 을 붙일 수 없다. 블로그·카페에 내가 거는 링크용이다.
    medium: "organic",
    campaign: "launch_2608",
    placement: "네이버 블로그·카페 글",
  },
  gg: {
    path: "/",
    source: "google",
    medium: "organic",
    campaign: "launch_2608",
    placement: "구글에 노출되는 외부 글",
  },
};

export function getMarketingLink(code: string) {
  return marketingLinks[code.trim().toLowerCase()];
}

/** 리다이렉트할 최종 주소. UTM 은 대장의 값만 붙으므로 임의 값이 섞일 수 없다. */
export function buildMarketingDestination(origin: string, link: MarketingLink) {
  const query = new URLSearchParams({
    utm_source: link.source,
    utm_medium: link.medium,
    utm_campaign: link.campaign,
  });
  return `${origin}${link.path}?${query.toString()}`;
}
