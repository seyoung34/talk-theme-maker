import { countOpenInquiries } from "@/lib/admin/consoleBadges";
import { buildAdminOverview, type AdminOverview, type Loaded } from "@/lib/admin/overview";
import { getRecentOpsDayRanges } from "@/lib/admin/overviewDays";
import { getCurrentOpsDay } from "@/lib/ops/dailySummary";
import { getOpsDailySummary, getOpsStatusSnapshot, listRecentOpsIssues } from "@/lib/ops/repository";
import { createAdminClient } from "@/lib/supabase/server";

export const overviewTrendDays = 7;

/**
 * 개요 화면 조회. 관리자 확인을 통과한 server component에서만 부른다(service role).
 *
 * 조회는 서로 독립이라 병렬로 보내고 각각 실패를 격리한다. 7일 추이는 일일 요약 RPC를 날짜마다
 * 부른다 — 집계는 SQL 안에서 끝나므로 행 수 제한과 무관하고, 날짜 하나가 실패해도 그날만 빈다.
 * 기간이 길어지면(30일 등) 날짜별 행을 돌려주는 RPC로 바꾼다.
 */
export async function loadAdminOverview(now = new Date()): Promise<AdminOverview & { day: string }> {
  const ranges = getRecentOpsDayRanges(getCurrentOpsDay(now), overviewTrendDays);
  const [snapshot, openInquiries, refundReviews, issues, ...days] = await Promise.all([
    settle("ops status snapshot", getOpsStatusSnapshot()),
    settle("open inquiries", countOpenInquiries()),
    settle("refund reviews", countRefundReviews()),
    settle("recent issues", listRecentOpsIssues({ limit: 6 }).then((result) => result.events)),
    ...ranges.map((range) => settle(`daily summary ${range.day}`, getOpsDailySummary({ startAt: range.startAt, endAt: range.endAt }))),
  ]);
  const today = ranges[ranges.length - 1]!;
  return {
    day: today.day,
    ...buildAdminOverview({
      snapshot,
      openInquiries,
      refundReviews,
      issues,
      days: ranges.map((range, index) => ({ day: range.day, counts: days[index]! })),
    }),
  };
}

/**
 * 지금 검토를 기다리는 환불 수.
 *
 * `get_ops_daily_summary.refunds_review_required`는 `updated_at`이 조회 기간 안인 건만 세서,
 * 어제 들어와 아직 처리하지 않은 건이 오늘 숫자에서 빠진다. 처리할 일은 기간과 무관하게 센다.
 */
async function countRefundReviews(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("refund_status", "review_required");
  if (error) throw error;
  if (typeof count !== "number") throw new Error("refund_review_count_missing");
  return count;
}

async function settle<T>(label: string, promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    console.warn(`Admin overview lookup failed: ${label}`, error);
    return { ok: false };
  }
}
