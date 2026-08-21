import type { SignupBonusClaimResponse } from "@/lib/billing/apiTypes";
import { readJsonResponse } from "@/lib/shared/api/http";

export async function claimSignupBonusFromClient(): Promise<SignupBonusClaimResponse | null> {
  const response = await fetch("/api/credits/signup-bonus", {
    method: "POST",
    cache: "no-store",
  });
  if (response.status === 401) return null;

  const payload = await readJsonResponse<SignupBonusClaimResponse>(response);
  if (!response.ok) throw new Error(payload.error ?? "가입 혜택을 확인하지 못했습니다.");
  return payload;
}
