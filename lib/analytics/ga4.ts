export const analyticsConsentStorageKey = "talktheme:analytics-consent:v1";

export type AnalyticsConsent = "granted" | "denied";
type AnalyticsPrimitive = string | number | boolean;
type AnalyticsItem = Record<string, AnalyticsPrimitive>;
export type AnalyticsEventParams = Record<string, AnalyticsPrimitive | AnalyticsItem[]>;

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
  const value = window.localStorage.getItem(analyticsConsentStorageKey);
  return value === "granted" || value === "denied" ? value : null;
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
  window.gtag?.("event", name, params);
}

export function trackPurchaseOnce(transactionId: string, params: AnalyticsEventParams) {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted" || !getAnalyticsMeasurementId()) return;
  const storageKey = `talktheme:ga4-purchase:${transactionId}`;
  if (window.sessionStorage.getItem(storageKey)) return;
  trackAnalyticsEvent("purchase", { transaction_id: transactionId, ...params });
  window.sessionStorage.setItem(storageKey, "1");
}
