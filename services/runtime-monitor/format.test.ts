import { describe, expect, it } from "vitest";
import { describeFailure, formatDuration, formatKstDateTime, formatKstRange, formatNotification } from "./format";
import { sources, type Notification, type Sample, type Source } from "./model";

// 2026-10-23T14:05:02.877Z — 실제로 받은 첫 알림의 시각. KST 금요일 23:05:02.
const firstAlertAt = 1792764302877;
const minute = 60_000;

const event = (input: { source: Source; phase: Notification["phase"]; code: string; at?: number; openedAt?: number; requests?: number }): Notification => {
  const at = input.at ?? firstAlertAt;
  const openedAt = input.openedAt ?? firstAlertAt;
  const sample: Sample = {
    source: input.source,
    outcome: input.phase === "recovered" ? "healthy" : "failed",
    code: input.code,
    observationId: String(at),
    at,
    ...(input.requests !== undefined ? { requests: input.requests, failures: 7 } : {}),
  };
  return { id: `${input.source}:${openedAt}:${input.phase}:${at}`, source: input.source, phase: input.phase, at, openedAt, sample };
};

describe("KST 시각", () => {
  it("UTC를 KST로 바꾸고 요일을 붙인다", () => {
    expect(formatKstDateTime(firstAlertAt)).toBe("10/23(금) 23:05:02 KST");
  });

  it("UTC 15시는 KST 다음 날 00시다 — 24시로 쓰지 않는다", () => {
    expect(formatKstDateTime(Date.UTC(2026, 9, 23, 15, 0, 0))).toBe("10/24(토) 00:00:00 KST");
  });

  it("연말을 넘긴다", () => {
    expect(formatKstDateTime(Date.UTC(2026, 11, 31, 15, 30, 0))).toBe("01/01(금) 00:30:00 KST");
  });

  it("유효하지 않은 값은 그대로 돌려준다", () => {
    expect(formatKstDateTime(Number.NaN)).toBe("NaN");
  });

  it("같은 날이면 시각만, 날짜를 넘기면 양쪽에 날짜를 붙인다", () => {
    expect(formatKstRange(firstAlertAt, firstAlertAt + 7 * minute)).toBe("23:05 ~ 23:12 KST");
    expect(formatKstRange(firstAlertAt, firstAlertAt + 60 * minute)).toBe("10/23(금) 23:05 ~ 10/24(토) 00:05 KST");
  });
});

describe("경과 시간", () => {
  it.each([
    [0, "1분 미만"],
    [minute - 1, "1분 미만"],
    [minute, "1분"],
    [7 * minute, "7분"],
    [60 * minute, "1시간"],
    [90 * minute, "1시간 30분"],
    [24 * 60 * minute, "1일"],
    [25 * 60 * minute, "1일 1시간"],
    [-minute, "1분 미만"],
  ])("%d ms → %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("실패 문장", () => {
  // http.ts·collect.ts가 실제로 만드는 실패 코드 전부.
  const failureCodes = [
    "request_timeout", "network_failed", "http_failed", "invalid_response", "response_too_large",
    "database_unavailable", "probe_failed", "collection_failed", "unclassified_outcome", "runtime_failure_candidates",
  ];

  it("실패 코드 전부가 일반 문장으로 떨어지지 않는다", () => {
    for (const code of failureCodes) {
      expect(describeFailure("public_http", code), code).not.toContain("알 수 없는 문제");
    }
  });

  it("모르는 코드는 일반 문장으로 떨어지고 코드 원문을 본문에 섞지 않는다", () => {
    expect(describeFailure("readiness", "brand_new_code")).toBe("DB 준비 상태 API 확인 중 알 수 없는 문제가 생겼습니다");
  });

  it("받침에 맞는 조사를 쓴다", () => {
    expect(describeFailure("public_http", "request_timeout")).toBe("사이트 첫 화면이 5초 안에 응답하지 않았습니다");
    expect(describeFailure("session_http", "request_timeout")).toBe("세션 API가 5초 안에 응답하지 않았습니다");
  });

  it("수집은 성공하고 해석만 못한 경우를 '받아오지 못했다'고 쓰지 않는다", () => {
    expect(describeFailure("cloudflare_collector", "unclassified_outcome")).not.toContain("받아오지");
  });
});

describe("알림 문구", () => {
  it("실제로 받은 수집기 시간초과 알림", () => {
    expect(formatNotification(event({ source: "cloudflare_collector", phase: "opened", code: "request_timeout" }))).toBe([
      "🟡 Cloudflare 통계 수집 실패",
      "TalkTheme 독립 감시 · 장애 감지",
      "",
      "무슨 일: Cloudflare 통계 API가 5초 안에 응답하지 않았습니다",
      "사이트 영향: 미확인 — 통계 수집·해석 문제입니다. 사이트 접속 장애는 별도 감시 항목이 따로 알립니다",
      "감지: 10/23(금) 23:05:02 KST",
      "",
      "할 일: 대기. '복구 확인'이 오면 끝입니다. '장애 지속'이 이어지면 감시기의 Cloudflare API 토큰·권한과 Cloudflare 상태 페이지를 확인하세요.",
      "",
      "코드: cloudflare_collector / request_timeout",
      "ID: cloudflare_collector:1792764302877:opened:1792764302877",
    ].join("\n"));
  });

  it("장애 지속은 감지 후 경과를 보여 준다", () => {
    const text = formatNotification(event({ source: "public_http", phase: "repeat", code: "http_failed", at: firstAlertAt + 12 * minute }));
    expect(text).toContain("🚨 사이트 접속 실패\nTalkTheme 독립 감시 · 장애 지속");
    expect(text).toContain("확인: 10/23(금) 23:17:02 KST · 감지 후 경과 12분");
  });

  it("복구는 지속 시간을 보여 주고 실패용 문구를 재사용하지 않는다", () => {
    const text = formatNotification(event({ source: "cloudflare_collector", phase: "recovered", code: "collection_ok", at: firstAlertAt + 7 * minute }));
    expect(text).toBe([
      "✅ Cloudflare 통계 수집 복구",
      "TalkTheme 독립 감시 · 복구 확인",
      "",
      "상태: Cloudflare 통계를 다시 받아옵니다",
      "감지~복구 확인: 7분 (23:05 ~ 23:12 KST)",
      "",
      "코드: cloudflare_collector / collection_ok",
      "ID: cloudflare_collector:1792764302877:recovered:1792764722877",
    ].join("\n"));
  });

  it("런타임 통계는 KST 집계 시간창과 표본 경고를 유지한다", () => {
    const text = formatNotification(event({ source: "cloudflare_runtime", phase: "opened", code: "runtime_failure_candidates", requests: 100 }));
    expect(text).toContain("집계 시간창: 23:00 ~ 23:05 KST (끝 제외)");
    expect(text).toContain("CPU 원인 확정이 아닙니다");
    expect(text).toContain("사용자 수/HTTP 실패율이 아닙니다");
  });

  // 할 일에는 로그 검색용 경로(/api/internal/ops/readiness 등)가 들어갈 수 있다. 내부 코드를 숨기는 대상은
  // 운영자가 처음 읽는 요약부(제목~시각)다.
  it.each(sources)("%s: 세 단계 모두 요약부에 내부 코드와 UTC 표기를 노출하지 않는다", (source) => {
    for (const phase of ["opened", "repeat", "recovered"] as const) {
      const code = phase === "recovered" ? "probe_ok" : "request_timeout";
      const text = formatNotification(event({ source, phase, code, at: firstAlertAt + 3 * minute }));
      const body = text.split(/\n\n(?:할 일|코드|관측 invocation)/)[0];
      expect(body, `${source}/${phase}`).not.toContain(source);
      expect(body, `${source}/${phase}`).not.toContain(code);
      expect(text, `${source}/${phase}`).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      // 어떤 출처도 관측 범위 밖의 정상을 단정하지 않는다.
      expect(text, `${source}/${phase}`).not.toContain("사이트 영향: 없음");
      if (phase === "recovered") {
        expect(text).not.toContain("사이트 영향:");
        expect(text).not.toContain("할 일:");
      }
    }
  });
});
