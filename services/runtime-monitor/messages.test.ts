/* eslint-disable @typescript-eslint/no-explicit-any -- 검증 실패를 보려고 카탈로그를 일부러 망가뜨린다. */
import { describe, expect, it, vi } from "vitest";
import bundled from "./messages.ko.json";
import { defaultCatalog, failureCodes, parseMessageCatalog, renderLayout, telegramTextLimit } from "./messages";
import { formatNotification } from "./format";
import { readMessageCatalog } from "./store";
import { sources, type Notification } from "./model";

const clone = () => structuredClone(bundled) as Record<string, any>;
const at = 1792764302877;
const failed = (phase: Notification["phase"], extra: Partial<Notification["sample"]> = {}): Notification => ({
  id: `public_http:${at}:${phase}:${at + 600000}`, source: "public_http", phase, at: at + 600000, openedAt: at,
  sample: { source: "public_http", outcome: "failed", code: "http_failed", observationId: String(at + 600000), at: at + 600000, ...extra },
});

describe("문구 카탈로그 검증", () => {
  it("원본 카탈로그는 모든 출처와 실패 코드를 덮는다", () => {
    expect(Object.keys(defaultCatalog.sources).sort()).toEqual([...sources].sort());
    for (const code of failureCodes) expect(defaultCatalog.failures[code]).toBeTruthy();
  });

  it.each([
    ["알 수 없는 치환자", (c: Record<string, any>) => { c.layouts.opened[0] = "{token}"; }, "알 수 없는 치환자 {token}"],
    ["실패 문장에서 레이아웃 치환자 사용", (c: Record<string, any>) => { c.failures.http_failed = "{httpStatus}"; }, "failures.http_failed"],
    ["닫히지 않은 중괄호", (c: Record<string, any>) => { c.sources.readiness.action = "확인 {target"; }, "중괄호 짝"],
    ["빠진 실패 코드", (c: Record<string, any>) => { delete c.failures.request_timeout; }, "failures.request_timeout (없음)"],
    ["빠진 출처", (c: Record<string, any>) => { delete c.sources.readiness; }, "sources.readiness"],
    ["모르는 최상위 항목", (c: Record<string, any>) => { c.extra = 1; }, "$.extra"],
    ["버전 불일치", (c: Record<string, any>) => { c.version = 2; }, "version"],
    ["빈 레이아웃", (c: Record<string, any>) => { c.layouts.update = []; }, "layouts.update"],
    ["모르는 when", (c: Record<string, any>) => { c.layouts.opened.push({ when: "secret", lines: ["x"] }); }, ".when"],
  ])("%s는 거부하고 위치를 알려 준다", (_, mutate, message) => {
    const catalog = clone();
    mutate(catalog);
    expect(() => parseMessageCatalog(catalog)).toThrow(message);
  });

  it("값이 없는 치환자 줄은 빠지고 빈 줄은 하나로 줄어든다", () => {
    expect(renderLayout(["제목", "", "", "HTTP 상태: {httpStatus}", "", "끝", ""], {})).toBe("제목\n\n끝");
    expect(renderLayout([{ when: "requests", lines: ["", "요청: {requests}"] }, "끝"], { requests: "3" })).toBe("요청: 3\n끝");
  });

  it("텔레그램 길이 한도를 넘지 않는다", () => {
    expect(renderLayout(["가".repeat(5000)], {})).toHaveLength(telegramTextLimit);
  });
});

describe("문구 레이아웃", () => {
  it("고쳐 쓰기는 감지 시각과 최근 확인 시각을 함께 보여 준다", () => {
    const text = formatNotification(failed("update", { httpStatus: 500, cfRay: "a5b17f78bea619ce-KIX" }));
    expect(text).toContain("TalkTheme 독립 감시 · 장애 진행 중");
    expect(text).toContain("감지: 10/23(금) 23:05:02 KST");
    expect(text).toContain("최근 확인: 10/23(금) 23:15:02 KST · 감지 후 경과 10분");
    expect(text).toContain("HTTP 상태: 500");
  });

  it("종료 표시는 원래 장애 제목과 복구 범위를 보여 주고 진단 값을 싣지 않는다", () => {
    const event = failed("recovered", { outcome: "healthy", code: "probe_ok", httpStatus: 500 });
    const text = formatNotification(event, defaultCatalog, "closed");
    expect(text.split("\n")[0]).toBe("☑️ 사이트 접속 실패 → 사이트 접속 복구");
    expect(text).toContain("감지~복구 확인: 10분 (23:05 ~ 23:15 KST)");
    expect(text).not.toContain("HTTP 상태");
  });

  it("운영 카탈로그로 바꾼 문구가 그대로 반영된다", () => {
    const custom = clone();
    custom.sources.public_http.failureTitle = "첫 화면 오류";
    const text = formatNotification(failed("opened"), parseMessageCatalog(custom));
    expect(text.split("\n")[0]).toBe("🚨 첫 화면 오류");
  });
});

describe("운영 템플릿 읽기", () => {
  it("파일이 없으면 로그 없이 원본을 쓴다", async () => {
    const log = vi.fn();
    expect(await readMessageCatalog(async () => null, log)).toBe(defaultCatalog);
    expect(log).not.toHaveBeenCalled();
  });

  it("읽기 실패·깨진 JSON·검증 실패·크기 초과는 원본으로 돌아가고 문구 원문을 로그에 싣지 않는다", async () => {
    const invalid = clone(); invalid.layouts.opened[0] = "운영자 메모 원문 {secret_value}";
    const cases: Array<() => Promise<Buffer | null>> = [
      async () => { throw new Error("403"); },
      async () => Buffer.from("{not json"),
      async () => Buffer.from(JSON.stringify(invalid)),
      async () => Buffer.alloc(70000, "a"),
    ];
    for (const read of cases) {
      const log = vi.fn();
      expect(await readMessageCatalog(read, log)).toBe(defaultCatalog);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "monitor_messages_fallback" }));
      expect(JSON.stringify(log.mock.calls)).not.toContain("운영자 메모 원문");
    }
  });

  it("유효한 운영 템플릿을 쓴다", async () => {
    const custom = clone(); custom.header = "감시기";
    const catalog = await readMessageCatalog(async () => Buffer.from(JSON.stringify(custom)), vi.fn());
    expect(catalog.header).toBe("감시기");
  });
});
