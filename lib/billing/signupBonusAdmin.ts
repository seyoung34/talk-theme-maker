import { signupBonusCampaignKey, type SignupBonusCampaignStatus } from "@/lib/billing/credits";
import type { SignupBonusCampaignDto } from "@/lib/billing/apiTypes";
import { createAdminClient } from "@/lib/supabase/server";

export type SignupBonusCampaign = SignupBonusCampaignDto;

const campaignSelect = "campaign_key,name,credits,status,starts_at,expires_at,max_grants,grant_count,created_at,updated_at";

export async function getSignupBonusCampaign(): Promise<SignupBonusCampaign | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_promotion_campaigns")
    .select(campaignSelect)
    .eq("campaign_key", signupBonusCampaignKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCampaign(data) : null;
}

export async function updateSignupBonusCampaignStatus(status: SignupBonusCampaignStatus): Promise<SignupBonusCampaign | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_promotion_campaigns")
    .update({ status })
    .eq("campaign_key", signupBonusCampaignKey)
    .select(campaignSelect)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCampaign(data) : null;
}

function mapCampaign(row: Record<string, unknown>): SignupBonusCampaign {
  return {
    campaignKey: String(row.campaign_key),
    name: String(row.name),
    credits: Number(row.credits),
    status: row.status === "inactive" ? "inactive" : "active",
    startsAt: String(row.starts_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    maxGrants: row.max_grants == null ? null : Number(row.max_grants),
    grantCount: Number(row.grant_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
