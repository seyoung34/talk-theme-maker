import { readGa4DailyVisitors, type Ga4VisitorResult } from "@/lib/analytics/ga4DataApi";
import { getOpsDailySummary, type OpsDailySummaryCounts } from "@/lib/ops/repository";

export const opsTimeZone = "Asia/Seoul";

export type OpsDayRange = {
  day: string;
  startAt: string;
  endAt: string;
};

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

export function getPreviousOpsDay(now = new Date()) {
  const currentDay = getKstDate(now);
  const currentStart = getOpsDayRange(currentDay);
  return getKstDate(new Date(Date.parse(currentStart.startAt) - 24 * 60 * 60 * 1000));
}

export function getCurrentOpsDay(now = new Date()) {
  return getKstDate(now);
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
