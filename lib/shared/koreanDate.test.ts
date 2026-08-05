import { describe, expect, it } from "vitest";
import { formatKoreanDate, formatKoreanDateTime } from "@/lib/shared/koreanDate";

/**
 * 표기는 실행 환경의 시간대를 따르면 안 된다.
 *
 * 서버 렌더는 Cloudflare Workers(UTC)에서 일어난다. `new Date(...).getFullYear()` 류를 쓰면
 * 한국 시간 00:00~09:00 에 발행된 글이 전날로 표시되고, 브라우저가 다시 그릴 때 날짜가 바뀐다.
 * 이 테스트도 UTC 환경에서 돌지만, 아래 값들이 KST 기준으로 나와야 한다.
 */
describe("formatKoreanDate", () => {
  it("한국 시간 자정 직후는 그날로 표시된다", () => {
    // 2026-08-05 00:30 KST = 2026-08-04 15:30 UTC
    expect(formatKoreanDate("2026-08-04T15:30:00.000Z")).toContain("2026");
    expect(formatKoreanDate("2026-08-04T15:30:00.000Z")).toContain("08");
    expect(formatKoreanDate("2026-08-04T15:30:00.000Z")).toContain("05");
  });

  it("한국 시간 오전 9시 이전도 UTC 전날로 밀리지 않는다", () => {
    // 2026-08-05 08:59 KST = 2026-08-04 23:59 UTC
    expect(formatKoreanDate("2026-08-04T23:59:00.000Z")).toContain("05");
  });

  it("한국 시간 자정 직전은 전날로 남는다", () => {
    // 2026-08-04 23:59 KST = 2026-08-04 14:59 UTC
    expect(formatKoreanDate("2026-08-04T14:59:00.000Z")).toContain("04");
  });

  it("날짜로 읽히지 않으면 빈 문자열이다", () => {
    expect(formatKoreanDate("어제")).toBe("");
  });
});

describe("formatKoreanDateTime", () => {
  it("시각도 한국 시간으로 표시한다", () => {
    // 2026-08-05 00:30 KST
    const formatted = formatKoreanDateTime("2026-08-04T15:30:00.000Z");
    expect(formatted).toContain("05");
    expect(formatted).toContain("00:30");
  });

  it("자정을 24시가 아니라 00시로 쓴다", () => {
    expect(formatKoreanDateTime("2026-08-04T15:00:00.000Z")).toContain("00:00");
  });

  it("날짜로 읽히지 않으면 빈 문자열이다", () => {
    expect(formatKoreanDateTime("")).toBe("");
  });
});
