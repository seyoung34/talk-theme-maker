import type { ExportFailureReason } from "@/lib/theme/export/failureReason";

export const analyticsConsentStorageKey = "talktheme:analytics-consent:v1";
const analyticsConsentCookieName = "talktheme_analytics_consent";
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
  window.gtag?.("event", name, { ...acquisition, ...context, ...params, page_location: `${window.location.origin}${window.location.pathname}` });
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
