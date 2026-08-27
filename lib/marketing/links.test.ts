import { describe, expect, it } from "vitest";
import { buildMarketingDestination, campaigns, getMarketingLink, marketingLinks } from "@/lib/marketing/links";
import { getAcquisitionContext, saveAnalyticsConsent } from "@/lib/analytics/ga4";

/**
 * 링크 대장과 GA4 허용 목록이 어긋나면 **내가 뿌린 링크가 통계에 안 잡힌다.**
 *
 * 허용 목록에 없는 값은 조용히 버려지므로 화면에도 오류가 없다. 홍보를 다 하고 나서
 * "왜 아무것도 안 잡히지"로 발견하게 되는 종류의 결함이라 테스트로 묶는다.
 */
describe("홍보 링크 대장", () => {
  it("모든 링크의 UTM 이 GA4 허용 목록을 통과한다", () => {
    saveAnalyticsConsent("granted");
    for (const [code, link] of Object.entries(marketingLinks)) {
      window.sessionStorage.clear();
      const destination = buildMarketingDestination("https://talktheme.shop", link);
      window.history.replaceState({}, "", destination.replace("https://talktheme.shop", ""));

      const context = getAcquisitionContext(link.path);
      expect(context.utm_source, `${code}: utm_source`).toBe(link.source);
      expect(context.utm_campaign, `${code}: utm_campaign`).toBe(link.campaign);
      // 매체는 GA4 채널 규칙에 맞춰 옮겨질 수 있다. 값이 살아남는 것만 확인한다.
      expect(context.utm_medium, `${code}: utm_medium 이 버려졌다`).toBeTruthy();
    }
  });

  it("모든 링크가 대장에 등록된 캠페인을 가리킨다", () => {
    for (const [code, link] of Object.entries(marketingLinks)) {
      expect(campaigns[link.campaign], `${code} 의 캠페인 ${link.campaign} 설명이 없다`).toBeDefined();
    }
  });

  it("캠페인마다 의미와 시작일이 적혀 있다", () => {
    // GA4 보고서에는 코드만 남는다. 반년 뒤에 해석하려면 이 기록이 유일한 단서다.
    for (const [key, campaign] of Object.entries(campaigns)) {
      expect(campaign.label, `${key}: label`).toBeTruthy();
      expect(campaign.note.length, `${key}: note 가 너무 짧다`).toBeGreaterThan(20);
      expect(campaign.startedOn, `${key}: startedOn`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("단축 코드는 짧게 유지한다", () => {
    // 인스타 바이오·카카오톡·문자·QR 에서 길이가 곧 불리함이다.
    for (const code of Object.keys(marketingLinks)) {
      expect(code.length, `${code} 가 길다`).toBeLessThanOrEqual(4);
      expect(code).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("getMarketingLink", () => {
  it("대소문자와 공백을 흘려보낸다", () => {
    expect(getMarketingLink(" IG ")).toBe(marketingLinks.ig);
  });

  it("모르는 코드는 undefined", () => {
    expect(getMarketingLink("없는코드")).toBeUndefined();
  });
});

describe("buildMarketingDestination", () => {
  it("대장의 값만 붙인다", () => {
    const url = new URL(buildMarketingDestination("https://talktheme.shop", marketingLinks.ig));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: marketingLinks.ig.source,
      utm_medium: marketingLinks.ig.medium,
      utm_campaign: marketingLinks.ig.campaign,
    });
  });
});
