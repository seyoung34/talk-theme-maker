import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { inquirySelectColumns, mapInquiryRow, type InquiryStatus } from "@/lib/inquiries/types";
import { mapNoticeRow, noticeSelectColumns } from "@/lib/notices/types";
import { buildWeeklyReport } from "@/lib/marketing/weekly";
import type { AdminGrantCode } from "./initialData";

/** Call only after page/API admin authorization. No cross-request cache is used. */
export async function listAdminInquiries(status?: InquiryStatus) {
  let query = createAdminClient().from("inquiries").select(inquirySelectColumns).order("updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapInquiryRow);
}

export async function listAdminNotices() {
  const { data, error } = await createAdminClient().from("notices").select(noticeSelectColumns)
    .order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapNoticeRow);
}

export async function loadAdminMarketingReport() {
  const admin = createAdminClient();
  const [summary, clicks] = await Promise.all([
    admin.rpc("marketing_weekly_summary", { p_weeks: 8 }),
    admin.rpc("marketing_weekly_clicks", { p_weeks: 8 }),
  ]);
  if (summary.error) throw summary.error;
  if (clicks.error) throw clicks.error;
  return buildWeeklyReport({ summaryRows: summary.data ?? [], redirectRequestRows: clicks.data ?? [] });
}

export async function listAdminGrantCodes(): Promise<AdminGrantCode[]> {
  const { data, error } = await createAdminClient().from("credit_grant_codes")
    .select("id,code_preview,name,credits,status,starts_at,expires_at,max_redemptions,redemption_count,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
