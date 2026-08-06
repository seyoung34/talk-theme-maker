import { campaigns } from "@/lib/marketing/links";

/**
 * 주간 마케팅 지표.
 *
 * **클릭과 전환은 이어붙이지 않는다.** 서버는 어떤 방문자가 어느 캠페인에서 왔는지 모른다 —
 * 그걸 알려면 유입 시점의 캠페인을 그 사람에게 붙여 두어야 하고, 그건 식별자를 저장하는
 * 일이라 동의 대상이 된다. 클릭 집계를 동의 없이 셀 수 있는 이유가 바로 그것을 하지 않기
 * 때문이다.
 *
 * 그래서 이 화면은 두 축을 **같은 주에 나란히** 보여줄 뿐, 한 줄로 합치지 않는다. "클릭이
 * 늘어난 주에 가입도 늘었는가"까지가 지금 정직하게 말할 수 있는 전부다.
 *
 * 집계 자체는 SQL 이 한다(`marketing_weekly_summary`·`marketing_weekly_clicks`). 여기서는
 * 두 결과를 주 단위로 맞춰 붙이기만 한다. 주 경계 계산이 앱과 DB 두 곳에 있으면 언젠가
 * 어긋난다.
 */
export type WeeklyMarketingRow = {
  /** 주의 시작일(월요일, Asia/Seoul). */
  readonly weekStart: string;
  readonly clicks: number;
  readonly signups: number;
  readonly exportsCompleted: number;
  readonly paymentsPaid: number;
};

export type CampaignClickRow = {
  readonly campaign: string;
  readonly label: string;
  readonly clicks: number;
};

export type WeeklyMarketingReport = {
  readonly weeks: readonly WeeklyMarketingRow[];
  readonly campaignClicks: readonly CampaignClickRow[];
  readonly since: string;
};

export type WeeklySummaryRow = {
  week_start: string;
  signups: number | string;
  exports_completed: number | string;
  payments_paid: number | string;
};

export type WeeklyClickRow = {
  week_start: string;
  campaign: string;
  clicks: number | string;
};

// Postgres 의 bigint 는 JSON 에서 문자열로 올 수 있다. 그대로 더하면 문자열 이어붙이기가 된다.
function toCount(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value ?? 0;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

export function buildWeeklyReport(input: {
  summaryRows: readonly WeeklySummaryRow[];
  clickRows: readonly WeeklyClickRow[];
}): WeeklyMarketingReport {
  const clicksByWeek = new Map<string, number>();
  const campaignTotals = new Map<string, number>();
  for (const row of input.clickRows) {
    const clicks = toCount(row.clicks);
    clicksByWeek.set(row.week_start, (clicksByWeek.get(row.week_start) ?? 0) + clicks);
    campaignTotals.set(row.campaign, (campaignTotals.get(row.campaign) ?? 0) + clicks);
  }

  return {
    since: input.summaryRows[0]?.week_start ?? "",
    weeks: input.summaryRows.map((row) => ({
      weekStart: row.week_start,
      clicks: clicksByWeek.get(row.week_start) ?? 0,
      signups: toCount(row.signups),
      exportsCompleted: toCount(row.exports_completed),
      paymentsPaid: toCount(row.payments_paid),
    })),
    campaignClicks: [...campaignTotals.entries()]
      .map(([campaign, clicks]) => ({
        campaign,
        // 대장에 없는 코드도 보여 준다. 지운 캠페인의 과거 데이터가 사라지면 안 된다.
        label: campaigns[campaign]?.label ?? campaign,
        clicks,
      }))
      .sort((left, right) => right.clicks - left.clicks),
  };
}
