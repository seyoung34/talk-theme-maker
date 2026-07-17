import { NextResponse, type NextRequest } from "next/server";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { readMinimumAgeConfirmationFromSearchParams, readPolicyConsentFromSearchParams, recordCurrentPolicyConsents, recordMinimumAgeConfirmation } from "@/lib/policies/consent";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeReturnTarget(url.searchParams.get("next"));
  const providerError = url.searchParams.get("error") || url.searchParams.get("error_code");
  const policyConsentSource = readPolicyConsentFromSearchParams(url.searchParams);
  const minimumAgeConfirmationSource = readMinimumAgeConfirmationFromSearchParams(url.searchParams);

  if (providerError) {
    return redirectToLogin(next, "인증 링크가 만료됐거나 이미 사용됐습니다. 인증 메일을 다시 요청해 주세요.");
  }

  if (!code) {
    return redirectToLogin(next, "인증 정보를 확인할 수 없습니다. 다시 시도해 주세요.");
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectToLogin(next, "인증 링크가 만료됐거나 이미 사용됐습니다. 인증 메일을 다시 요청해 주세요.");
    if (policyConsentSource) await recordCurrentPolicyConsents(supabase, policyConsentSource);
    else if (minimumAgeConfirmationSource) await recordMinimumAgeConfirmation(supabase, minimumAgeConfirmationSource);
  } catch {
    return redirectToLogin(next, "인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return NextResponse.redirect(new URL(next, getSiteUrl()));
}

function redirectToLogin(next: string, message: string) {
  const loginUrl = new URL("/login", getSiteUrl());
  loginUrl.searchParams.set("returnTo", next);
  loginUrl.searchParams.set("authError", message);
  return NextResponse.redirect(loginUrl);
}
