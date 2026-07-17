import { describe, expect, it } from "vitest";
import { addMinimumAgeConfirmationToCallbackUrl, addPolicyConsentToCallbackUrl, currentPolicyVersions, minimumAgeConfirmationVersion, readMinimumAgeConfirmationFromSearchParams, readPolicyConsentFromSearchParams } from "@/lib/policies/consent";

describe("policy consent callback", () => {
  it("round-trips the current policy versions and signup source", () => {
    const value = addPolicyConsentToCallbackUrl("https://talktheme.shop/auth/callback?next=%2Fedit", "email_signup");
    const url = new URL(value);

    expect(url.searchParams.get("next")).toBe("/edit");
    expect(url.searchParams.get("policyConsent")).toBe(`${currentPolicyVersions.terms}:${currentPolicyVersions.privacy}`);
    expect(readPolicyConsentFromSearchParams(url.searchParams)).toBe("email_signup");
    expect(readMinimumAgeConfirmationFromSearchParams(url.searchParams)).toBe("email_signup");
  });

  it("round-trips a Kakao minimum-age confirmation without policy consent", () => {
    const value = addMinimumAgeConfirmationToCallbackUrl("https://talktheme.shop/auth/callback?next=%2Fedit", "kakao_signup");
    const url = new URL(value);
    expect(url.searchParams.get("minimumAgeConfirmation")).toBe(minimumAgeConfirmationVersion);
    expect(readMinimumAgeConfirmationFromSearchParams(url.searchParams)).toBe("kakao_signup");
    expect(readPolicyConsentFromSearchParams(url.searchParams)).toBeNull();
  });

  it("rejects stale versions and unknown sources", () => {
    expect(readPolicyConsentFromSearchParams(new URLSearchParams("policyConsent=old:old&policyConsentSource=email_signup"))).toBeNull();
    expect(readPolicyConsentFromSearchParams(new URLSearchParams(`policyConsent=${currentPolicyVersions.terms}:${currentPolicyVersions.privacy}&policyConsentSource=unknown`))).toBeNull();
  });
});
