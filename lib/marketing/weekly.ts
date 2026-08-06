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

/** 한국 시간 기준 그 주의 월요일. 주 경계가 사람마다 다르면 비교가 안 되므로 한 곳에서 정한다. */
export function toWeekStart(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  // UTC 로 다루면 한국 시간 월요일 새벽이 전주로 밀린다.
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const weekday = (seoul.getUTCDay() + 6) % 7; // 월=0
  seoul.setUTCDate(seoul.getUTCDate() - weekday);
  return seoul.toISOString().slice(0, 10);
}

/** 최근 `count`주의 시작일을 과거→현재 순으로. 데이터가 없는 주도 0으로 남긴다. */
export function recentWeekStarts(count: number, now = new Date()) {
  const current = toWeekStart(now);
  const weeks: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(`${current}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - index * 7);
    weeks.push(date.toISOString().slice(0, 10));
  }
  return weeks;
}

export function buildWeeklyReport(input: {
  weekStarts: readonly string[];
  clickRows: readonly { day: string; campaign: string; hits: number }[];
  signupDates: readonly string[];
  exportDates: readonly string[];
  paymentDates: readonly string[];
}): WeeklyMarketingReport {
  const empty = () => Object.fromEntries(input.weekStarts.map((week) => [week, 0])) as Record<string, number>;
  const clicks = empty();
  const signups = empty();
  const exportsCompleted = empty();
  const paymentsPaid = empty();

  for (const row of input.clickRows) {
    const week = toWeekStart(`${row.day}T00:00:00.000Z`);
    if (week in clicks) clicks[week] += row.hits;
  }
  const countInto = (target: Record<string, number>, dates: readonly string[]) => {
    for (const date of dates) {
      const week = toWeekStart(date);
      if (week in target) target[week] += 1;
    }
  };
  countInto(signups, input.signupDates);
  countInto(exportsCompleted, input.exportDates);
  countInto(paymentsPaid, input.paymentDates);

  const campaignTotals = new Map<string, number>();
  for (const row of input.clickRows) {
    campaignTotals.set(row.campaign, (campaignTotals.get(row.campaign) ?? 0) + row.hits);
  }

  return {
    since: input.weekStarts[0] ?? "",
    weeks: input.weekStarts.map((weekStart) => ({
      weekStart,
      clicks: clicks[weekStart],
      signups: signups[weekStart],
      exportsCompleted: exportsCompleted[weekStart],
      paymentsPaid: paymentsPaid[weekStart],
    })),
    campaignClicks: [...campaignTotals.entries()]
      .map(([campaign, clickCount]) => ({
        campaign,
        // 대장에 없는 코드도 보여 준다. 지운 캠페인의 과거 데이터가 사라지면 안 된다.
        label: campaigns[campaign]?.label ?? campaign,
        clicks: clickCount,
      }))
      .sort((left, right) => right.clicks - left.clicks),
  };
}
