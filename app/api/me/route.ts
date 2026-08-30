import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUserOrNull, signupBonusCampaignKey } from "@/lib/billing/credits";
import { creditLedgerFetchLimit } from "@/lib/billing/creditLedger";

export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ user: null, profile: null, credits: 0, exports: [], ledger: [], signupBonus: null, isAdmin: false });

  const admin = createAdminClient();
  const [{ error: profileUpsertError }, { error: balanceUpsertError }] = await Promise.all([
    admin.from("profiles").upsert({ user_id: user.id, email: user.email ?? "", display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null, avatar_url: user.user_metadata?.avatar_url ?? null, provider: user.app_metadata?.provider ?? "email" }),
    admin.from("credit_balances").upsert({ user_id: user.id, balance: 0 }, { ignoreDuplicates: true }),
  ]);
  if (profileUpsertError || balanceUpsertError) {
    console.error("Failed to initialize account data", { profile: profileUpsertError, balance: balanceUpsertError });
    return NextResponse.json({ error: "계정 정보를 초기화하지 못했습니다.", reason: "account_initialization_failed" }, { status: 500 });
  }

  const [profileResult, balanceResult, exportsResult, adminResult, signupBonusResult, ledgerResult] = await Promise.all([
    admin.from("profiles").select("user_id,email,display_name,avatar_url,provider").eq("user_id", user.id).maybeSingle(),
    admin.from("credit_balances").select("balance,billing_hold").eq("user_id", user.id).maybeSingle(),
    admin.from("export_jobs").select("id,platform,export_mode,export_backend,status,stage,credit_cost,file_name,export_number,application_id,theme_identifier,export_name,error,error_code,input_file_count,input_bytes,output_bytes,duration_ms,created_at,completed_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("admin_profiles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
    admin.from("credit_promotion_claims").select("campaign_key,credits,created_at").eq("user_id", user.id).eq("campaign_key", signupBonusCampaignKey).maybeSingle(),
    // `reason`은 캠페인 키·결제 사유가 들어가는 가변 값이라 내려보내지 않는다. 화면 라벨은
    // `type`과 금액 부호로 정하므로 필요하지 않고, 내부 슬러그를 사용자에게 노출할 이유도 없다.
    admin.from("credit_ledger").select("id,amount,type,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(creditLedgerFetchLimit),
  ]);
  const readError = profileResult.error ?? balanceResult.error ?? exportsResult.error ?? adminResult.error ?? signupBonusResult.error ?? ledgerResult.error;
  if (readError) {
    console.error("Failed to read account data", readError);
    return NextResponse.json({ error: "계정 정보를 불러오지 못했습니다.", reason: "account_read_failed" }, { status: 500 });
  }
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profileResult.data,
    credits: balanceResult.data?.balance ?? 0,
    billingHold: balanceResult.data?.billing_hold ?? false,
    exports: exportsResult.data ?? [],
    ledger: ledgerResult.data ?? [],
    signupBonus: signupBonusResult.data ? {
      campaignKey: signupBonusResult.data.campaign_key,
      creditsGranted: signupBonusResult.data.credits,
      claimedAt: signupBonusResult.data.created_at,
    } : null,
    isAdmin: Boolean(adminResult.data),
  });
}
