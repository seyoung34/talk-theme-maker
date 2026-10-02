import { getOpsDayRange, type OpsDayRange } from "@/lib/ops/dailySummary";

/** 오늘을 포함한 최근 `count`일의 KST 범위. 오래된 날부터. */
export function getRecentOpsDayRanges(today: string, count: number): OpsDayRange[] {
  const todayRange = getOpsDayRange(today);
  const dayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.parse(todayRange.startAt) - (count - 1 - index) * dayMs);
    // KST는 서머타임이 없어 하루가 항상 24시간이다. +09:00 기준 날짜 문자열로 되돌린다.
    const day = new Date(start.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return getOpsDayRange(day);
  });
}
