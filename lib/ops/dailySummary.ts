import { readGa4DailyVisitors, type Ga4VisitorResult } from "@/lib/analytics/ga4DataApi";
import { getOpsDailySummary, type OpsDailySummaryCounts } from "@/lib/ops/repository";

export const opsTimeZone = "Asia/Seoul";

export type OpsDayRange = {
  day: string;
  startAt: string;
  endAt: string;
};

export type OpsCompletedDayValidation =
  | { ok: true; day: string }
  | { ok: false; reason: "invalid_date" | "date_not_closed" };

export type OpsDailySummary = OpsDailySummaryCounts & {
  day: string;
  startAt: string;
  endAt: string;
  visitors: Ga4VisitorResult;
};

export async function readOpsDailySummary(day: string): Promise<OpsDailySummary> {
  const range = getOpsDayRange(day);
  const [database, visitors] = await Promise.all([
    getOpsDailySummary({ startAt: range.startAt, endAt: range.endAt }),
    readGa4DailyVisitors(range.day),
  ]);
  return { ...range, ...database, visitors };
}

export type OpsWeekRange = {
  firstDay: string;
  lastDay: string;
  startAt: string;
  endAt: string;
};

export type OpsWeekSummary = OpsDailySummaryCounts & OpsWeekRange;

/**
 * 오늘을 뺀 최근 7일(KST). `[7일 전 00:00, 오늘 00:00)`.
 *
 * 한국은 서머타임이 없어 하루는 항상 24시간이다. 그래서 날짜를 일곱 번 거슬러 올라가지 않고
 * 시각을 7×24시간 빼도 같은 경계가 나온다.
 */
export function getOpsWeekRange(now = new Date()): OpsWeekRange {
  const today = getOpsDayRange(getCurrentOpsDay(now));
  const startAt = new Date(Date.parse(today.startAt) - 7 * 24 * 60 * 60 * 1000);
  return {
    firstDay: getKstDate(startAt),
    lastDay: getPreviousOpsDay(now),
    startAt: startAt.toISOString(),
    endAt: today.startAt,
  };
}

/**
 * 일일 요약 RPC를 7일 구간으로 한 번 부른다. RPC는 하루 길이를 강제하지 않고 `[start, end)`를 그대로 받는다.
 *
 * 주의: `exportsPending`·`openInquiries`는 RPC가 구간과 무관하게 **조회 시점의 현재 값**을 돌려준다.
 * 기간 합계처럼 표시하면 안 된다. 또 결제·환불·전송 포기는 현재 행의 상태로 세므로, 이미 발송된
 * 일일 요약 7개를 더한 값과 다를 수 있다.
 */
export async function readOpsWeekSummary(now = new Date()): Promise<OpsWeekSummary> {
  const range = getOpsWeekRange(now);
  const counts = await getOpsDailySummary({ startAt: range.startAt, endAt: range.endAt });
  return { ...range, ...counts };
}

export function getPreviousOpsDay(now = new Date()) {
  const currentDay = getKstDate(now);
  const currentStart = getOpsDayRange(currentDay);
  return getKstDate(new Date(Date.parse(currentStart.startAt) - 24 * 60 * 60 * 1000));
}

export function getCurrentOpsDay(now = new Date()) {
  return getKstDate(now);
}

export function validateCompletedOpsDay(day: string, now = new Date()): OpsCompletedDayValidation {
  try {
    getOpsDayRange(day);
  } catch {
    return { ok: false, reason: "invalid_date" };
  }

  if (day >= getCurrentOpsDay(now)) return { ok: false, reason: "date_not_closed" };
  return { ok: true, day };
}

export function getOpsDayRange(day: string): OpsDayRange {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("invalid_ops_day");
  const start = new Date(`${day}T00:00:00+09:00`);
  if (!Number.isFinite(start.getTime()) || getKstDate(start) !== day) throw new Error("invalid_ops_day");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { day, startAt: start.toISOString(), endAt: end.toISOString() };
}

function getKstDate(value: Date) {
  if (!Number.isFinite(value.getTime())) throw new Error("invalid_ops_time");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: opsTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("invalid_ops_time");
  return `${year}-${month}-${day}`;
}
