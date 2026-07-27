import type { ExportFailureReason } from "@/lib/theme/export/failureReason";

export const analyticsConsentStorageKey = "talktheme:analytics-consent:v1";
const analyticsConsentCookieName = "talktheme_analytics_consent";
export const analyticsInternalStorageKey = "talktheme:analytics-internal:v1";
const analyticsInternalCookieName = "talktheme_analytics_internal";
const acquisitionStorageKey = "talktheme:analytics-acquisition:v1";
const funnelContextStorageKey = "talktheme:analytics-funnel-context:v1";
const allowedUtmValues = {
  utm_source: new Set(["instagram"]),
  utm_medium: new Set(["social"]),
  utm_campaign: new Set(["instagram_personal_launch"]),
};
const knownCampaignKeys = new Set(["instagram_personal_launch"]);

export type AnalyticsConsent = "granted" | "denied";
type AnalyticsPrimitive = string | number | boolean;
type AnalyticsItem = Record<string, AnalyticsPrimitive>;
type AnalyticsEventParams = Record<string, AnalyticsPrimitive | AnalyticsItem[]>;
type AcquisitionContext = Partial<Record<"landing_page" | "referrer_host" | "utm_source" | "utm_medium" | "utm_campaign", string>>;
type FunnelContext = Partial<Record<"template_key" | "template_source" | "platform", string>>;

type AnalyticsEventMap = {
  page_view: { page_path: string } & AcquisitionContext;
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
  const acquisition = name === "page_view" ? {} : getAcquisitionContext(window.location.pathname);
  // GA4 데이터 필터가 읽는 파라미터 이름이다. params 뒤에 둬서 이벤트 쪽에서 덮어쓸 수 없게 한다.
  const trafficType = isInternalTraffic() ? { traffic_type: "internal" } : {};
  window.gtag?.("event", name, {
    ...acquisition,
    ...context,
    ...params,
    ...trafficType,
    page_location: `${window.location.origin}${window.location.pathname}`,
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
    if (value && allowedValues.has(value)) context[key] = value;
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
