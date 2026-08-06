import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { denyNonAdmin } from "@/lib/notices/adminApi";
import { buildWeeklyReport, recentWeekStarts } from "@/lib/marketing/weekly";

export const dynamic = "force-dynamic";

const weekCount = 8;

/**
 * 주간 마케팅 지표.
 *
 * 클릭은 `marketing_link_hits`(동의 무관 전수), 전환은 서비스 운영 기록에서 온다. 둘 다
 * GA4 와 달리 동의율에 영향받지 않는 숫자다.
 *
 * 전환은 `profiles`·`export_jobs`·`payments` 를 세는데, **날짜만 읽고 사용자 식별자는 가져오지
 * 않는다.** 집계에 필요하지 않고, 응답에 담기면 관리자 화면이 개인정보를 나르게 된다.
 */
export async function GET() {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  const weekStarts = recentWeekStarts(weekCount);
  const since = `${weekStarts[0]}T00:00:00.000Z`;
  const admin = createAdminClient();

  const [clicks, signups, exports, payments] = await Promise.all([
    admin.from("marketing_link_hits").select("day,campaign,hits").gte("day", weekStarts[0]),
    admin.from("profiles").select("created_at").gte("created_at", since),
    admin.from("export_jobs").select("created_at").eq("status", "completed").gte("created_at", since),
    admin.from("payments").select("created_at").eq("status", "paid").gte("created_at", since),
  ]);

  const failed = [clicks, signups, exports, payments].find((result) => result.error);
  if (failed?.error) {
    console.error("주간 마케팅 지표 조회 실패", failed.error);
    return NextResponse.json({ error: "지표를 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    report: buildWeeklyReport({
      weekStarts,
      clickRows: clicks.data ?? [],
      signupDates: (signups.data ?? []).map((row) => row.created_at),
      exportDates: (exports.data ?? []).map((row) => row.created_at),
      paymentDates: (payments.data ?? []).map((row) => row.created_at),
    }),
  });
}
