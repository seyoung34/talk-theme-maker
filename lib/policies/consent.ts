import type { SupabaseClient } from "@supabase/supabase-js";

export const currentPolicyVersions = {
  terms: "2026-07-14",
  privacy: "2026-07-14",
} as const;
export const minimumAgeConfirmationVersion = "2026-07-14";

export type PolicyConsentSource = "email_signup" | "kakao_signup" | "account_reconsent";

const policyConsentQueryKey = "policyConsent";
const policyConsentSourceQueryKey = "policyConsentSource";
const ageConfirmationQueryKey = "minimumAgeConfirmation";
const ageConfirmationSourceQueryKey = "minimumAgeConfirmationSource";

export function addPolicyConsentToCallbackUrl(url: string, source: Exclude<PolicyConsentSource, "account_reconsent">) {
  const callbackUrl = new URL(url);
  callbackUrl.searchParams.set(policyConsentQueryKey, `${currentPolicyVersions.terms}:${currentPolicyVersions.privacy}`);
  callbackUrl.searchParams.set(policyConsentSourceQueryKey, source);
  callbackUrl.searchParams.set(ageConfirmationQueryKey, minimumAgeConfirmationVersion);
  callbackUrl.searchParams.set(ageConfirmationSourceQueryKey, source);
  return callbackUrl.toString();
}

export function addMinimumAgeConfirmationToCallbackUrl(url: string, source: Exclude<PolicyConsentSource, "account_reconsent">) {
  const callbackUrl = new URL(url);
  callbackUrl.searchParams.set(ageConfirmationQueryKey, minimumAgeConfirmationVersion);
  callbackUrl.searchParams.set(ageConfirmationSourceQueryKey, source);
  return callbackUrl.toString();
}

export function readPolicyConsentFromSearchParams(searchParams: URLSearchParams) {
  const expected = `${currentPolicyVersions.terms}:${currentPolicyVersions.privacy}`;
  const source = searchParams.get(policyConsentSourceQueryKey);
  if (searchParams.get(policyConsentQueryKey) !== expected) return null;
  if (source !== "email_signup" && source !== "kakao_signup") return null;
  return source;
}

export function readMinimumAgeConfirmationFromSearchParams(searchParams: URLSearchParams) {
  const source = searchParams.get(ageConfirmationSourceQueryKey);
  if (searchParams.get(ageConfirmationQueryKey) !== minimumAgeConfirmationVersion) return null;
  if (source !== "email_signup" && source !== "kakao_signup") return null;
  return source;
}

export async function recordCurrentPolicyConsents(supabase: SupabaseClient, source: PolicyConsentSource) {
  const rows = [
    { policy_type: "terms", policy_version: currentPolicyVersions.terms, source },
    { policy_type: "privacy", policy_version: currentPolicyVersions.privacy, source },
    { policy_type: "age_14", policy_version: minimumAgeConfirmationVersion, source },
  ];

  const { error } = await supabase
    .from("user_policy_consents")
    .upsert(rows, { onConflict: "user_id,policy_type,policy_version", ignoreDuplicates: true });
  if (error) throw error;
}

export async function recordMinimumAgeConfirmation(supabase: SupabaseClient, source: Exclude<PolicyConsentSource, "account_reconsent">) {
  const { error } = await supabase
    .from("user_policy_consents")
    .upsert(
      { policy_type: "age_14", policy_version: minimumAgeConfirmationVersion, source },
      { onConflict: "user_id,policy_type,policy_version", ignoreDuplicates: true },
    );
  if (error) throw error;
}
