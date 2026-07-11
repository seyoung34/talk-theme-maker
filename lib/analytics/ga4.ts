export const analyticsConsentStorageKey = "talktheme:analytics-consent:v1";
const analyticsConsentCookieName = "talktheme_analytics_consent";
const acquisitionStorageKey = "talktheme:analytics-acquisition:v1";
const allowedUtmValues = {
  utm_source: new Set(["instagram"]),
  utm_medium: new Set(["social"]),
  utm_campaign: new Set(["instagram_personal_launch"]),
};
const knownCampaignKeys = new Set(["instagram_personal_launch"]);

export type AnalyticsConsent = "granted" | "denied";
type AnalyticsPrimitive = string | number | boolean;
type AnalyticsItem = Record<string, AnalyticsPrimitive>;
export type AnalyticsEventParams = Record<string, AnalyticsPrimitive | AnalyticsItem[]>;
type AcquisitionContext = Partial<Record<"landing_page" | "referrer_host" | "utm_source" | "utm_medium" | "utm_campaign", string>>;

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

export function initializeAnalytics(measurementId: string) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => { window.dataLayer?.push(args); });
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
}

export function trackAnalyticsEvent(name: string, params: AnalyticsEventParams = {}) {
  if (getAnalyticsConsent() !== "granted" || !getAnalyticsMeasurementId() || typeof window === "undefined") return;
  window.gtag?.("event", name, { ...params, page_location: `${window.location.origin}${window.location.pathname}` });
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

export function trackPurchaseOnce(transactionId: string, params: AnalyticsEventParams) {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted" || !getAnalyticsMeasurementId()) return;
  const storageKey = `talktheme:ga4-purchase:${transactionId}`;
  if (window.sessionStorage.getItem(storageKey)) return;
  trackAnalyticsEvent("purchase", { transaction_id: transactionId, ...params });
  window.sessionStorage.setItem(storageKey, "1");
}
