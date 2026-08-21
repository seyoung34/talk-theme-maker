import { NextResponse } from "next/server";
import { claimSignupBonusForCurrentUser, getCurrentUserOrNull, isSignupBonusUnavailableError, signupBonusCampaignKey } from "@/lib/billing/credits";

export async function POST() {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  try {
    const claim = await claimSignupBonusForCurrentUser();
    return NextResponse.json({
      campaignKey: claim.campaignKey,
      creditsGranted: claim.creditsGranted,
      balance: claim.balance,
      alreadyClaimed: claim.alreadyClaimed,
      granted: claim.creditsGranted > 0 && !claim.alreadyClaimed,
    });
  } catch (error) {
    if (isSignupBonusUnavailableError(error)) {
      return NextResponse.json({
        campaignKey: signupBonusCampaignKey,
        creditsGranted: 0,
        alreadyClaimed: false,
        granted: false,
        reason: error instanceof Error ? error.message : "signup_bonus_unavailable",
      });
    }
    console.error("Failed to claim signup bonus", error);
    return NextResponse.json({ error: "가입 혜택을 처리하지 못했습니다.", reason: "signup_bonus_claim_failed" }, { status: 500 });
  }
}
