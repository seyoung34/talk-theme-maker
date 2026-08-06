import { describe, expect, it } from "vitest";
import { buildWeeklyReport, recentWeekStarts, toWeekStart } from "@/lib/marketing/weekly";

/**
 * 주 경계는 한국 시간 월요일이다.
 *
 * UTC 로 계산하면 한국 시간 월요일 새벽(= UTC 일요일 저녁)에 일어난 일이 전주로 밀린다.
 * 주간 비교가 목적인 화면에서 경계가 흔들리면 숫자를 믿을 수 없다. 이 테스트는 UTC 환경에서
 * 돌지만 아래 값들이 KST 기준으로 나와야 한다.
 */
describe("toWeekStart", () => {
  it("한국 시간 월요일 새벽은 그 주로 들어간다", () => {
    // 2026-08-10(월) 00:30 KST = 2026-08-09(일) 15:30 UTC
    expect(toWeekStart("2026-08-09T15:30:00.000Z")).toBe("2026-08-10");
  });

  it("한국 시간 일요일 밤은 전주로 남는다", () => {
    // 2026-08-09(일) 23:00 KST = 2026-08-09 14:00 UTC
    expect(toWeekStart("2026-08-09T14:00:00.000Z")).toBe("2026-08-03");
  });

  it("주 중간은 그 주의 월요일을 가리킨다", () => {
    expect(toWeekStart("2026-08-07T05:00:00.000Z")).toBe("2026-08-03");
  });

  it("날짜로 읽히지 않으면 빈 문자열", () => {
    expect(toWeekStart("어제")).toBe("");
  });
});

describe("recentWeekStarts", () => {
  it("과거에서 현재 순으로 연속된 주를 만든다", () => {
    const weeks = recentWeekStarts(3, new Date("2026-08-07T05:00:00.000Z"));
    expect(weeks).toEqual(["2026-07-20", "2026-07-27", "2026-08-03"]);
  });
});

describe("buildWeeklyReport", () => {
  const weekStarts = ["2026-07-27", "2026-08-03"];

  it("클릭과 전환을 주별로 나눠 센다", () => {
    const report = buildWeeklyReport({
      weekStarts,
      clickRows: [
        { day: "2026-07-28", campaign: "friends_test", hits: 5 },
        { day: "2026-08-04", campaign: "friends_test", hits: 7 },
      ],
      signupDates: ["2026-08-05T01:00:00.000Z"],
      exportDates: ["2026-08-05T02:00:00.000Z", "2026-08-06T02:00:00.000Z"],
      paymentDates: [],
    });

    expect(report.weeks).toEqual([
      { weekStart: "2026-07-27", clicks: 5, signups: 0, exportsCompleted: 0, paymentsPaid: 0 },
      { weekStart: "2026-08-03", clicks: 7, signups: 1, exportsCompleted: 2, paymentsPaid: 0 },
    ]);
  });

  it("범위 밖 데이터는 버린다", () => {
    // 조회 범위보다 오래된 행이 섞여도 주간 합계가 오염되면 안 된다.
    const report = buildWeeklyReport({
      weekStarts,
      clickRows: [{ day: "2026-06-01", campaign: "friends_test", hits: 99 }],
      signupDates: ["2026-06-01T00:00:00.000Z"],
      exportDates: [],
      paymentDates: [],
    });
    expect(report.weeks.every((week) => week.clicks === 0 && week.signups === 0)).toBe(true);
  });

  it("캠페인별 클릭을 많은 순으로 모은다", () => {
    const report = buildWeeklyReport({
      weekStarts,
      clickRows: [
        { day: "2026-08-04", campaign: "friends_test", hits: 3 },
        { day: "2026-08-05", campaign: "launch_2608", hits: 9 },
        { day: "2026-08-06", campaign: "friends_test", hits: 2 },
      ],
      signupDates: [],
      exportDates: [],
      paymentDates: [],
    });

    expect(report.campaignClicks.map((row) => [row.campaign, row.clicks])).toEqual([
      ["launch_2608", 9],
      ["friends_test", 5],
    ]);
    expect(report.campaignClicks[0].label).toBe("8월 공개 런칭");
  });

  it("대장에 없는 캠페인도 코드 그대로 보여 준다", () => {
    // 옛 캠페인 항목을 지워도 과거 데이터가 화면에서 사라지면 안 된다.
    const report = buildWeeklyReport({
      weekStarts,
      clickRows: [{ day: "2026-08-04", campaign: "removed_code", hits: 1 }],
      signupDates: [],
      exportDates: [],
      paymentDates: [],
    });
    expect(report.campaignClicks[0]).toMatchObject({ campaign: "removed_code", label: "removed_code" });
  });
});
