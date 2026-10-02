import { describe, expect, it } from "vitest";
import { getRecentOpsDayRanges } from "./overviewDays";

describe("getRecentOpsDayRanges", () => {
  it("오늘을 포함한 KST 날짜를 오래된 순서로 만들고 월 경계를 넘는다", () => {
    const ranges = getRecentOpsDayRanges("2026-10-02", 7);
    expect(ranges.map((range) => range.day)).toEqual([
      "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
    expect(ranges[6]).toEqual({ day: "2026-10-02", startAt: "2026-10-01T15:00:00.000Z", endAt: "2026-10-02T15:00:00.000Z" });
  });
});
