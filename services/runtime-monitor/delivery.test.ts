import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { emptyState, type MonitorState, type Notification, type Sample } from "./model";
import { defaultCatalog, type MessageCatalog } from "./messages";
import { closeIncidentMessage, runTick, sendNotification, type DeliveryContext } from "./runner";
import type { StateStore } from "./store";

const config = readConfig({
  MONITOR_TARGET_ORIGIN: "https://site.test", MONITOR_CF_ACCOUNT_TAG: "a".repeat(32),
  MONITOR_CF_SCRIPT_NAME: "talk-theme-maker", MONITOR_READINESS_TOKEN: "r".repeat(32),
  MONITOR_STATE_BUCKET: "fixture-bucket", MONITOR_CF_API_TOKEN: "private-token",
  MONITOR_ALERTS_ENABLED: "1", MONITOR_TELEGRAM_BOT_TOKEN: "123:" + "t".repeat(30), MONITOR_TELEGRAM_CHAT_ID: "-100",
  MONITOR_FAILURE_CHECKS: "2", MONITOR_RECOVERY_CHECKS: "2", MONITOR_COOLDOWN_SECONDS: "300",
  MONITOR_RUNTIME_FAILURE_COUNT: "5", MONITOR_RUNTIME_FAILURE_PERCENT: "5",
});
const minute = 60000;
const sample = (at: number, outcome: Sample["outcome"]): Sample =>
  ({ source: "public_http", at, outcome, observationId: String(at), code: outcome === "failed" ? "http_failed" : "probe_ok" });
const event = (phase: Notification["phase"], at = 10 * minute): Notification =>
  ({ id: `public_http:0:${phase}:${at}`, source: "public_http", phase, at, openedAt: 0, sample: sample(at, phase === "recovered" ? "healthy" : "failed") });

function memoryStore() {
  let state = emptyState(), generation = 0;
  const store: StateStore = {
    load: async () => ({ state: structuredClone(state), generation: String(generation) }),
    save: async (next, expected) => {
      if (expected !== String(generation)) throw new Error("cas_conflict");
      state = structuredClone(next); return String(++generation);
    },
  };
  return { store, read: () => structuredClone(state) as MonitorState };
}

function telegram(responses: Array<{ status?: number; body?: unknown }>) {
  const fetcher = vi.fn<typeof fetch>();
  for (const { status = 200, body = { ok: true, result: { message_id: 41 } } } of responses) {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }
  const calls = () => fetcher.mock.calls.map(([url, init]) => ({
    method: String(url).split("/").at(-1), body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  }));
  return { fetcher, calls };
}

describe("텔레그램 전달", () => {
  const context = (messageId?: number): DeliveryContext => ({ catalog: defaultCatalog, messageId });

  it("장애 감지는 새 메시지를 보내고 message_id를 돌려준다", async () => {
    const api = telegram([{}]);
    expect(await sendNotification(config, event("opened"), context(), api.fetcher)).toBe(41);
    expect(api.calls()).toEqual([expect.objectContaining({ method: "sendMessage", body: expect.not.objectContaining({ reply_parameters: expect.anything() }) })]);
  });

  it("고쳐 쓰기는 첫 메시지를 editMessageText로 바꾸고 새 메시지를 보내지 않는다", async () => {
    const api = telegram([{}]);
    expect(await sendNotification(config, event("update"), context(41), api.fetcher)).toBeUndefined();
    expect(api.calls()).toEqual([{ method: "editMessageText", body: expect.objectContaining({ message_id: 41, text: expect.stringContaining("장애 진행 중") }) }]);
  });

  it("고칠 메시지를 모르면 아무것도 보내지 않는다", async () => {
    const api = telegram([]);
    await sendNotification(config, event("update"), context(), api.fetcher);
    expect(api.fetcher).not.toHaveBeenCalled();
  });

  it("고쳐 쓰기의 400(내용 동일·삭제된 메시지)은 성공으로 보고 다시 보내지 않는다", async () => {
    const api = telegram([{ status: 400, body: { ok: false, description: "Bad Request: message is not modified" } }]);
    await expect(sendNotification(config, event("update"), context(41), api.fetcher)).resolves.toBeUndefined();
  });

  it("고쳐 쓰기의 일시 장애(429·5xx)는 다시 시도하도록 실패시킨다", async () => {
    const api = telegram([{ status: 429, body: { ok: false } }]);
    await expect(sendNotification(config, event("update"), context(41), api.fetcher)).rejects.toThrow();
  });

  it("장애 지속은 첫 메시지에 답장으로 보낸다", async () => {
    const api = telegram([{}]);
    await sendNotification(config, event("repeat"), context(41), api.fetcher);
    expect(api.calls()[0].body.reply_parameters).toEqual({ message_id: 41, allow_sending_without_reply: true });
  });

  it("복구는 첫 메시지에 답장만 보내고, 종료 표시는 별도 함수가 맡는다", async () => {
    const api = telegram([{}]);
    await expect(sendNotification(config, event("recovered"), context(41), api.fetcher)).resolves.toBe(41);
    expect(api.calls()).toEqual([expect.objectContaining({ method: "sendMessage", body: expect.objectContaining({ reply_parameters: { message_id: 41, allow_sending_without_reply: true } }) })]);
    const close = telegram([{}]);
    await closeIncidentMessage(config, event("recovered"), 41, defaultCatalog, close.fetcher);
    expect(close.calls()[0]).toMatchObject({ method: "editMessageText", body: { message_id: 41 } });
    expect(close.calls()[0].body.text).toContain("종료 · 복구 확인");
  });

  it("운영 템플릿이 빈 메시지를 만들면 원본 문구로 보낸다", async () => {
    const custom = structuredClone(defaultCatalog);
    custom.layouts.opened = ["HTTP 상태: {httpStatus}"];
    const api = telegram([{}]);
    await sendNotification(config, event("opened"), { catalog: custom }, api.fetcher);
    expect(String(api.calls()[0].body.text)).toContain("사이트 접속 실패");
  });
});

describe("사건과 메시지 연결", () => {
  function harness() {
    const memory = memoryStore();
    let nextId = 40;
    const send = vi.fn<(notification: Notification, context: DeliveryContext) => Promise<number | undefined>>(async () => ++nextId);
    const close = vi.fn<(notification: Notification, messageId: number, catalog: MessageCatalog) => Promise<void>>(async () => undefined);
    const messages = vi.fn(async () => defaultCatalog);
    let outcome: Sample["outcome"] = "failed";
    const run = (at: number, extra: Partial<Parameters<typeof runTick>[1]> = {}) => runTick(config, {
      store: memory.store, now: () => at, health: async now => [sample(now, outcome)], metrics: async () => [], send, close, messages, ...extra,
    });
    return { memory, send, close, messages, run, set: (value: Sample["outcome"]) => { outcome = value; } };
  }

  it("첫 메시지 id를 사건별로 저장하고 고쳐 쓰기·복구·종료 표시에 쓴 뒤 지운다", async () => {
    const h = harness();
    await h.run(0); await h.run(5 * minute);
    expect(h.memory.read().threads).toEqual([{ source: "public_http", openedAt: 5 * minute, messageId: 41 }]);
    await h.run(10 * minute);
    expect(h.send.mock.calls.at(-1)).toEqual([expect.objectContaining({ phase: "update" }), expect.objectContaining({ messageId: 41 })]);
    h.set("healthy");
    await h.run(15 * minute); await h.run(20 * minute);
    expect(h.send.mock.calls.at(-1)).toEqual([expect.objectContaining({ phase: "recovered" }), expect.objectContaining({ messageId: 41 })]);
    expect(h.close).toHaveBeenCalledWith(expect.objectContaining({ phase: "recovered" }), 41, defaultCatalog);
    expect(h.memory.read().threads).toBeUndefined();
    // 문구 템플릿은 실제로 보낼 알림이 있는 tick에서 한 번만 읽는다.
    expect(h.messages).toHaveBeenCalledTimes(3);
  });

  it("옛 사건 알림이 밀려 있는 동안 새 사건이 열려도 각자 자기 메시지에 이어진다", async () => {
    const h = harness();
    const down = vi.fn(async () => { throw new Error("telegram_down"); });
    // 텔레그램 장애 중에 사건 A가 열리고 닫힌 뒤 사건 B가 열린다.
    await h.run(0, { send: down }); await h.run(5 * minute, { send: down });
    h.set("healthy"); await h.run(10 * minute, { send: down }); await h.run(15 * minute, { send: down });
    h.set("failed"); await h.run(20 * minute, { send: down }); await h.run(25 * minute, { send: down });
    expect(h.memory.read().pending.map(e => [e.phase, e.openedAt])).toEqual([["opened", 5 * minute], ["recovered", 5 * minute], ["opened", 25 * minute]]);
    await h.run(30 * minute);
    const delivered = h.send.mock.calls.map(([notification, context]) => [notification.phase, notification.openedAt, context.messageId]);
    expect(delivered.slice(0, 3)).toEqual([["opened", 5 * minute, undefined], ["recovered", 5 * minute, 41], ["opened", 25 * minute, undefined]]);
    expect(h.close).toHaveBeenCalledWith(expect.objectContaining({ openedAt: 5 * minute }), 41, defaultCatalog);
    expect(h.memory.read().threads).toEqual([{ source: "public_http", openedAt: 25 * minute, messageId: 43 }]);
  });

  it("종료 표시는 lease 안전 여유를 침범할 것 같으면 건너뛴다", async () => {
    const h = harness();
    await h.run(0); await h.run(5 * minute);
    h.set("healthy"); await h.run(10 * minute);
    let now = 15 * minute;
    // 복구 전송이 lease(120초) 시작 후 101초에 끝났다. 전송 확인(15초 여유)은 되지만,
    // 5초짜리 고쳐 쓰기를 더하면 여유 안으로 들어가므로 건너뛴다.
    const slowSend = vi.fn(async (notification: Notification) => { now += 101_000; return notification.phase === "opened" ? 41 : undefined; });
    await runTick(config, { store: h.memory.store, now: () => now, health: async at => [sample(at, "healthy")], metrics: async () => [], send: slowSend, close: h.close, messages: h.messages });
    expect(slowSend).toHaveBeenCalledWith(expect.objectContaining({ phase: "recovered" }), expect.anything());
    expect(h.close).not.toHaveBeenCalled();
    expect(h.memory.read().pending).toHaveLength(0);
  });
});

describe("재알림 간격 설정", () => {
  const base = { ...Object.fromEntries(Object.entries({
    MONITOR_TARGET_ORIGIN: "https://site.test", MONITOR_CF_ACCOUNT_TAG: "a".repeat(32), MONITOR_CF_SCRIPT_NAME: "x",
    MONITOR_READINESS_TOKEN: "r".repeat(32), MONITOR_STATE_BUCKET: "fixture-bucket", MONITOR_CF_API_TOKEN: "t",
    MONITOR_FAILURE_CHECKS: "2", MONITOR_RECOVERY_CHECKS: "2", MONITOR_COOLDOWN_SECONDS: "300",
    MONITOR_RUNTIME_FAILURE_COUNT: "5", MONITOR_RUNTIME_FAILURE_PERCENT: "5",
  })) };
  it("기본값은 30·60·120·240분이다", () => {
    expect(readConfig(base).policy.repeatScheduleMs).toEqual([30, 60, 120, 240].map(m => m * minute));
  });
  it("환경변수로 바꿀 수 있다", () => {
    expect(readConfig({ ...base, MONITOR_REPEAT_MINUTES: "15, 45" }).policy.repeatScheduleMs).toEqual([15 * minute, 45 * minute]);
  });
  it.each(["0", "4", "60,30", "abc", "1441", "5,5,5,5,5,5,5,5,5"])("%s는 거부한다", value => {
    expect(() => readConfig({ ...base, MONITOR_REPEAT_MINUTES: value })).toThrow("monitor_configuration_invalid");
  });
});
