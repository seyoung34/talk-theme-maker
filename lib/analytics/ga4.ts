import type { ExportFailureReason } from "@/lib/theme/export/failureReason";

export const analyticsConsentStorageKey = "talktheme:analytics-consent:v1";
export const analyticsConsentChangedEvent = "talktheme:analytics-consent-changed";
const analyticsConsentCookieName = "talktheme_analytics_consent";
export const analyticsInternalStorageKey = "talktheme:analytics-internal:v1";
const analyticsInternalCookieName = "talktheme_analytics_internal";
const acquisitionStorageKey = "talktheme:analytics-acquisition:v1";
const funnelContextStorageKey = "talktheme:analytics-funnel-context:v1";
/**
 * 허용 목록. 여기에 없는 값은 조용히 버린다.
 *
 * 임의 문자열을 그대로 보내면 오타·봇·장난 값이 GA4 측정기준에 쌓여 보고서를 못 쓰게 된다.
 * 대신 **새 채널을 쓰려면 이 목록을 먼저 고쳐야 한다.**
 *
 * `lib/marketing/links.ts`의 링크 대장이 쓰는 값은 전부 여기 있어야 한다. 어긋나면 내가 뿌린
 * 링크가 통계에 안 잡히므로 테스트로 묶어 두었다.
 */
const allowedUtmValues = {
  utm_source: new Set(["instagram", "naver", "google", "tiktok", "youtube", "x", "community", "direct_share"]),
  utm_medium: new Set(["social", "search", "organic", "video", "community", "referral"]),
  utm_campaign: new Set([
    "friends_test",
    "launch_2608",
    // 아래는 이 체계 이전에 쓰던 값이다. 이미 뿌린 링크가 있을 수 있어 계속 받는다.
    "instagram_personal_launch", "naver_search", "google_search", "tiktok_launch", "youtube_launch", "x_launch", "community_launch",
  ]),
};

/**
 * GA4 기본 채널 그룹이 알아듣는 매체 값으로 옮긴다.
 *
 * `utm_medium`은 자유 라벨이 아니다. GA4는 이 값을 패턴으로 읽어 채널 그룹을 정하고, 규칙에
 * 없는 값은 전부 `Unassigned`로 떨어뜨린다. 실제로 지난 7일 세션의 최다 구간이 `Unassigned`였다.
 *
 *   search    → organic    자연 검색 규칙은 `organic`이다. `search`는 어느 규칙에도 없다.
 *   community → referral   다른 사이트에서 넘어온 링크. GA4에 커뮤니티라는 채널은 없다.
 *
 * 이미 뿌린 링크를 회수할 수 없으므로 **입력은 옛 값도 받고 전송할 때 옮긴다.** 허용 목록에
 * `organic`·`referral`을 함께 넣어 둔 것은 새 링크가 정식 값을 바로 쓸 수 있게 하기 위해서다.
 *
 * GA4는 채널 그룹 규칙을 바꿔 왔다. 채널을 늘릴 때는 실제 속성의 트래픽 획득 보고서에서
 * 어느 채널로 잡히는지 확인하고 이 표를 갱신한다.
 */
const ga4MediumAliases: Record<string, string> = {
  search: "organic",
  community: "referral",
};

function toGa4Medium(medium: string) {
  return ga4MediumAliases[medium] ?? medium;
}

/**
 * `page_location`에 붙일 캠페인 쿼리.
 *
 * GA4는 `dl`(document location) 안의 `utm_*`를 읽어 세션 소스·매체·캠페인을 채우고, 그 값으로
 * 채널 그룹을 정한다. 그런데 이 앱은 쿼리를 통째로 잘라 보내고 있었다 — 로그인 `returnTo`,
 * 오류 코드처럼 무엇이든 들어올 수 있는 자리라 개인정보가 분석 도구로 새는 것을 막으려는
 * 조치였지만, UTM까지 함께 잘려 캠페인 귀속이 통째로 끊겼다.
 *
 * 그래서 **허용 목록을 통과한 세 값만 다시 조립한다.** 원본 쿼리는 여전히 버리므로 임의 값이
 * 새어 나갈 여지는 없고, GA4 자동 귀속만 되살아난다.
 */
function buildCampaignQuery(acquisition: AcquisitionContext) {
  const query = new URLSearchParams();
  if (acquisition.utm_source) query.set("utm_source", acquisition.utm_source);
  if (acquisition.utm_medium) query.set("utm_medium", toGa4Medium(acquisition.utm_medium));
  if (acquisition.utm_campaign) query.set("utm_campaign", acquisition.utm_campaign);
  const value = query.toString();
  return value ? `?${value}` : "";
}
const knownCampaignKeys = new Set(["instagram_personal_launch", "naver_search", "google_search", "tiktok_launch", "youtube_launch", "x_launch", "community_launch"]);

export type AnalyticsConsent = "granted" | "denied";
type AnalyticsPrimitive = string | number | boolean;
type AnalyticsItem = Record<string, AnalyticsPrimitive>;
type AnalyticsEventParams = Record<string, AnalyticsPrimitive | AnalyticsItem[]>;
type AcquisitionContext = Partial<Record<"landing_page" | "referrer_host" | "utm_source" | "utm_medium" | "utm_campaign", string>>;
type FunnelContext = Partial<Record<"template_key" | "template_source" | "platform", string>>;

type AnalyticsEventMap = {
  page_view: { page_path: string } & AcquisitionContext;
  landing_primary_cta_clicked: { viewport_group: "mobile" | "desktop"; destination: "template" };
  landing_signup_cta_clicked: { destination: "login" };
  auth_prompt_viewed: { reason: "export" | "general"; mode: "signin" | "signup" };
  signup_started: { provider: "email" | "kakao" };
  signup_completed: { provider: "email" | "kakao" };
  signup_failed: { provider: "email" | "kakao"; reason: "auth_error" };
  signup_bonus_granted: { campaign_key: string; credits_granted: number };
  login_started: { provider: "email" | "kakao" };
  login_completed: { provider: "email" | "kakao" };
  login_failed: { provider: "email" | "kakao"; reason: "auth_error" };
  first_value_reached: { action: "upload" | "candidate" | "color" };
  autosave_completed: { mode: string };
  autosave_failed: { reason: "quota" | "storage" | "conflict" };
  autosave_recovered: { mode: string };
  install_guide_viewed: { platform: string };
  install_confirmed: { platform: string };
  install_help_requested: { platform: string };
  template_viewed: { template_key: string; template_source: string; platform?: string };
  template_started: { template_key: string; template_source: string; platform: string };
  editor_ready: { template_key: string; template_source: string; platform: string };
  slot_upload_completed: { slot_role: string; section: string; asset_source: string };
  candidate_selected: { slot_role: string; section: string; asset_source: string };
  color_changed: { slot_role: string; section: string };
  bubble_edit_completed: { slot_role: string; section: string; edit_type?: string };
  template_save_completed: { save_mode: string; platform: string };
  export_started: { platform: string; export_mode: string };
  export_completed: { platform: string; export_mode: string };
  // failure_reason은 자유 문자열이 아니다. 서버 원문·파일명이 분석 축으로 새지 않도록 허용 목록 타입으로 묶는다.
  export_failed: { platform: string; export_mode: string; failure_reason: ExportFailureReason };
  export_blocked_insufficient_credits: { platform: string; export_mode: string; credits_remaining: number };
  credit_purchase_viewed: { entry_point: string; provider: string };
  begin_checkout: { currency: string; value: number; provider: string; items: AnalyticsItem[] };
  purchase: { transaction_id: string; currency: string; value: number; items: AnalyticsItem[] };
  credit_redeem_completed: { credits_granted: number; source: string };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getAnalyticsMeasurementId() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return measurementId && /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : null;
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  const value = readStoredConsent() ?? readConsentCookie();
  return value === "granted" || value === "denied" ? value : null;
}

export function saveAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(analyticsConsentStorageKey, consent);
  } catch {
    // Privacy extensions can block localStorage. The first-party cookie below is the fallback.
  }
  document.cookie = `${analyticsConsentCookieName}=${consent}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  window.dispatchEvent(new Event(analyticsConsentChangedEvent));
}

/**
 * 운영자 본인의 트래픽을 지표에서 골라낼 수 있게 표시한다.
 *
 * 차단이 아니라 **표시**다. 이벤트는 그대로 수집되고 `traffic_type: "internal"`이 붙어서 나가며,
 * GA4의 데이터 필터(내부 트래픽)로 리포트에서 걸러낸다. 차단해 버리면 나중에 "내 트래픽도 같이
 * 보고 싶다"가 됐을 때 그 기간 데이터가 아예 없다. 표시해 두면 필터만 끄면 된다.
 *
 * **표시는 계정이 아니라 기기에 남긴다.** `page_view`는 페이지가 뜨자마자 나가는데 관리자 여부는
 * `/api/session` 응답이 와야 알 수 있어서, 매 방문마다 로그인 확인을 기다리면 첫 이벤트를 놓친다.
 * 관리자로 확인된 시점에 이 기기를 한 번 표시해 두면 이후 방문은 로그아웃 상태여도 계속 붙는다.
 * 놓치는 건 각 기기에서 관리자로 처음 로그인하기 이전의 이벤트뿐이고, 그것도 한 번뿐이다.
 *
 * 동의 플래그와 같은 이유로 localStorage와 1년짜리 자사 쿠키에 이중으로 쓴다.
 * 프라이버시 확장 프로그램이 localStorage를 막는 경우가 있다.
 */
export function isInternalTraffic() {
  if (typeof window === "undefined") return false;
  return (readStoredInternalTraffic() ?? readInternalTrafficCookie()) === "1";
}

export function markInternalTraffic() {
  if (typeof window === "undefined" || isInternalTraffic()) return;
  try {
    window.localStorage.setItem(analyticsInternalStorageKey, "1");
  } catch {
    // Privacy extensions can block localStorage. The first-party cookie below is the fallback.
  }
  document.cookie = `${analyticsInternalCookieName}=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

function readStoredInternalTraffic() {
  try {
    return window.localStorage.getItem(analyticsInternalStorageKey);
  } catch {
    return null;
  }
}

function readInternalTrafficCookie() {
  const prefix = `${analyticsInternalCookieName}=`;
  return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export function getKnownCampaignKey(value: string | null) {
  return value && knownCampaignKeys.has(value) ? value : null;
}

export function getAnalyticsBootstrapScript(measurementId: string) {
  const safeMeasurementId = /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : "";
  return `(function(){var id=${JSON.stringify(safeMeasurementId)};if(!id)return;var key=${JSON.stringify(analyticsConsentStorageKey)};var cookie=${JSON.stringify(analyticsConsentCookieName)};var stored=null;try{stored=localStorage.getItem(key);}catch(e){}if(stored!=="granted"&&stored!=="denied"){var match=document.cookie.split(";").map(function(v){return v.trim();}).find(function(v){return v.indexOf(cookie+"=")===0;});stored=match?match.slice(cookie.length+1):null;}window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag("consent","default",{analytics_storage:stored==="granted"?"granted":"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});window.gtag("js",new Date());window.gtag("config",id,{send_page_view:false});var tag=document.createElement("script");tag.async=true;tag.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(id);document.head.appendChild(tag);})();`;
}

export function updateAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  window.gtag?.("consent", "update", { analytics_storage: consent === "granted" ? "granted" : "denied" });
}

export function trackAnalyticsEvent<Name extends AnalyticsEventName>(name: Name, params: AnalyticsEventMap[Name]) {
  if (getAnalyticsConsent() !== "granted" || !getAnalyticsMeasurementId() || typeof window === "undefined") return;
  if (name === "template_started" || name === "editor_ready") {
    saveFunnelContext(params);
  }
  const context = name === "page_view" ? {} : readFunnelContext() ?? {};
  // `page_view`는 호출부(AnalyticsProvider)가 이미 유입 정보를 params 에 담아 넘긴다.
  // 여기서 또 넣으면 중복이라 비워 두지만, page_location 에 실을 값은 따로 읽어야 한다.
  const acquisition = name === "page_view" ? {} : getAcquisitionContext(window.location.pathname);
  // GA4 데이터 필터가 읽는 파라미터 이름이다. params 뒤에 둬서 이벤트 쪽에서 덮어쓸 수 없게 한다.
  const trafficType = isInternalTraffic() ? { traffic_type: "internal" } : {};
  // GA4 는 이 값 안의 utm_* 로 세션 소스·매체·캠페인을 정한다. 원본 쿼리 대신 허용 목록을
  // 통과한 세 값만 다시 붙인다.
  const campaignQuery = buildCampaignQuery(getAcquisitionContext(window.location.pathname));
  window.gtag?.("event", name, {
    ...acquisition,
    ...context,
    ...params,
    ...trafficType,
    page_location: `${window.location.origin}${window.location.pathname}${campaignQuery}`,
  });
}

export function getAcquisitionContext(pathname: string): AcquisitionContext {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted") return {};
  const stored = readAcquisitionContext();
  if (stored) return stored;

  const query = new URLSearchParams(window.location.search);
  const context: AcquisitionContext = { landing_page: pathname };
  for (const [key, allowedValues] of Object.entries(allowedUtmValues) as Array<[keyof typeof allowedUtmValues, Set<string>]>) {
    const value = query.get(key)?.trim().toLowerCase();
    if (!value || !allowedValues.has(value)) continue;
    // 저장 시점에 GA4 값으로 옮긴다. 이벤트 파라미터와 page_location 이 서로 다른 매체를
    // 말하면 두 보고서가 어긋나 원인을 찾기 어려워진다.
    context[key] = key === "utm_medium" ? toGa4Medium(value) : value;
  }
  const referrerHost = getReferrerHost(document.referrer);
  if (referrerHost) context.referrer_host = referrerHost;
  window.sessionStorage.setItem(acquisitionStorageKey, JSON.stringify(context));
  return context;
}

function readAcquisitionContext(): AcquisitionContext | null {
  try {
    const value = window.sessionStorage.getItem(acquisitionStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as AcquisitionContext;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveFunnelContext(params: AnalyticsEventParams) {
  const context: FunnelContext = {};
  for (const key of ["template_key", "template_source", "platform"] as const) {
    const value = params[key];
    if (typeof value === "string" && value) context[key] = value;
  }
  try {
    window.sessionStorage.setItem(funnelContextStorageKey, JSON.stringify(context));
  } catch {
    // Analytics context is best-effort and must never block the product flow.
  }
}

function readFunnelContext(): FunnelContext | null {
  try {
    const value = window.sessionStorage.getItem(funnelContextStorageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as FunnelContext;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredConsent() {
  try {
    return window.localStorage.getItem(analyticsConsentStorageKey);
  } catch {
    return null;
  }
}

function readConsentCookie() {
  const prefix = `${analyticsConsentCookieName}=`;
  return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function getReferrerHost(referrer: string) {
  try {
    return new URL(referrer).hostname || undefined;
  } catch {
    return undefined;
  }
}

export function trackPurchaseOnce(transactionId: string, params: Omit<AnalyticsEventMap["purchase"], "transaction_id">) {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted" || !getAnalyticsMeasurementId()) return;
  const storageKey = `talktheme:ga4-purchase:${transactionId}`;
  if (window.sessionStorage.getItem(storageKey)) return;
  trackAnalyticsEvent("purchase", { transaction_id: transactionId, ...params });
  window.sessionStorage.setItem(storageKey, "1");
}
