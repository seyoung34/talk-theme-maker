import { describe, expect, it } from "vitest";
import { buildWeeklyReport } from "@/lib/marketing/weekly";

/**
 * 주 경계·조회 범위·완료 시각 판정은 전부 SQL(`marketing_weekly_summary`)에 있다. 앱과 DB 두
 * 곳에서 주를 자르면 언젠가 어긋나고, 어긋난 구간은 오류 없이 조용히 빠진다.
 *
 * 그래서 여기서 검증할 것은 "두 집계 결과를 주 단위로 맞춰 붙이는 일"뿐이다.
 */
describe("buildWeeklyReport", () => {
  const summaryRows = [
    { week_start: "2026-07-27", signups: 2, exports_completed: 1, payments_paid: 0 },
    { week_start: "2026-08-03", signups: 1, exports_completed: 3, payments_paid: 1 },
  ];

  it("주별로 리디렉션 요청과 전환을 맞춰 붙인다", () => {
    const report = buildWeeklyReport({
      summaryRows,
      redirectRequestRows: [
        { week_start: "2026-07-27", campaign: "friends_test", clicks: 5 },
        { week_start: "2026-08-03", campaign: "friends_test", clicks: 7 },
      ],
    });

    expect(report.weeks).toEqual([
      { weekStart: "2026-07-27", redirectRequests: 5, signups: 2, exportsCompleted: 1, paymentsPaid: 0 },
      { weekStart: "2026-08-03", redirectRequests: 7, signups: 1, exportsCompleted: 3, paymentsPaid: 1 },
    ]);
  });

  it("한 주에 여러 캠페인이 있으면 합쳐서 센다", () => {
    // 같은 주에 캠페인을 전환하면 이런 모양이 된다.
    const report = buildWeeklyReport({
      summaryRows,
      redirectRequestRows: [
        { week_start: "2026-08-03", campaign: "friends_test", clicks: 4 },
        { week_start: "2026-08-03", campaign: "launch_2608", clicks: 6 },
      ],
    });

    expect(report.weeks[1].redirectRequests).toBe(10);
  });

  it("리디렉션 요청이 없는 주는 0으로 남는다", () => {
    const report = buildWeeklyReport({ summaryRows, redirectRequestRows: [] });
    expect(report.weeks.map((week) => week.redirectRequests)).toEqual([0, 0]);
  });

  it("bigint 가 문자열로 와도 더한다", () => {
    // Postgres 의 count(*)는 bigint 라 JSON 에서 문자열로 올 수 있다. 그대로 더하면 "5"+"7" 이 된다.
    const report = buildWeeklyReport({
      summaryRows: [{ week_start: "2026-08-03", signups: "12", exports_completed: "3", payments_paid: "1" }],
      redirectRequestRows: [
        { week_start: "2026-08-03", campaign: "friends_test", clicks: "5" },
        { week_start: "2026-08-03", campaign: "launch_2608", clicks: "7" },
      ],
    });

    expect(report.weeks[0]).toEqual({ weekStart: "2026-08-03", redirectRequests: 12, signups: 12, exportsCompleted: 3, paymentsPaid: 1 });
  });

  it("캠페인별 리디렉션 요청을 많은 순으로 모은다", () => {
    const report = buildWeeklyReport({
      summaryRows,
      redirectRequestRows: [
        { week_start: "2026-07-27", campaign: "friends_test", clicks: 3 },
        { week_start: "2026-08-03", campaign: "launch_2608", clicks: 9 },
        { week_start: "2026-08-03", campaign: "friends_test", clicks: 2 },
      ],
    });

    expect(report.campaignRequests.map((row) => [row.campaign, row.requests])).toEqual([
      ["launch_2608", 9],
      ["friends_test", 5],
    ]);
    expect(report.campaignRequests[0].label).toBe("8월 공개 런칭");
  });

  it("0인 테스트 행은 캠페인 목록에서 숨긴다", () => {
    const report = buildWeeklyReport({
      summaryRows,
      redirectRequestRows: [{ week_start: "2026-08-03", campaign: "probe", clicks: 0 }],
    });
    expect(report.campaignRequests).toEqual([]);
  });

  it("대장에 없는 캠페인도 코드 그대로 보여 준다", () => {
    // 옛 캠페인 항목을 지워도 과거 데이터가 화면에서 사라지면 안 된다.
    const report = buildWeeklyReport({
      summaryRows,
      redirectRequestRows: [{ week_start: "2026-08-03", campaign: "removed_code", clicks: 1 }],
    });
    expect(report.campaignRequests[0]).toMatchObject({ campaign: "removed_code", label: "removed_code" });
  });
});
