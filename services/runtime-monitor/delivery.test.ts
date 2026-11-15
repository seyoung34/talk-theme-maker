import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { emptyState, type MonitorState, type Notification, type Sample } from "./model";
import { defaultCatalog } from "./messages";
import { runTick, sendNotification, type DeliveryContext } from "./runner";
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

  it("복구는 답장으로 알리고 첫 메시지를 종료 상태로 고쳐 쓴다. 고쳐 쓰기 실패는 복구 전달을 되돌리지 않는다", async () => {
    const api = telegram([{}, { status: 500, body: { ok: false } }]);
    await expect(sendNotification(config, event("recovered"), context(41), api.fetcher)).resolves.toBe(41);
    const [sent, edited] = api.calls();
    expect(sent).toMatchObject({ method: "sendMessage", body: { reply_parameters: { message_id: 41 } } });
    expect(edited).toMatchObject({ method: "editMessageText", body: { message_id: 41 } });
    expect(edited.body.text).toContain("종료 · 복구 확인");
  });
});

describe("사건과 메시지 연결", () => {
  it("첫 메시지 id를 사건에 저장하고 이후 고쳐 쓰기·복구에 넘긴다", async () => {
    const memory = memoryStore();
    const send = vi.fn<(notification: Notification, context: DeliveryContext) => Promise<number | undefined>>(async notification => notification.phase === "opened" ? 41 : undefined);
    const messages = vi.fn(async () => defaultCatalog);
    let outcome: Sample["outcome"] = "failed";
    const run = (at: number) => runTick(config, {
      store: memory.store, now: () => at, health: async now => [sample(now, outcome)], metrics: async () => [], send, messages,
    });
    await run(0); await run(5 * minute);
    expect(memory.read().incidents.public_http).toMatchObject({ messageId: 41, messageOpenedAt: 5 * minute });
    await run(10 * minute);
    expect(send.mock.calls.at(-1)).toEqual([expect.objectContaining({ phase: "update" }), expect.objectContaining({ messageId: 41 })]);
    outcome = "healthy";
    await run(15 * minute); await run(20 * minute);
    expect(send.mock.calls.at(-1)).toEqual([expect.objectContaining({ phase: "recovered" }), expect.objectContaining({ messageId: 41 })]);
    // 문구 템플릿은 실제로 보낼 알림이 있는 tick에서 한 번만 읽는다.
    expect(messages).toHaveBeenCalledTimes(3);
  });

  it("다른 사건의 메시지에 고쳐 쓰기를 붙이지 않는다", async () => {
    const memory = memoryStore();
    const state = emptyState();
    state.incidents.public_http = { active: true, failures: 3, successes: 0, openedAt: 9 * minute, lastQueuedAt: 9 * minute, lastObservationId: "1", messageId: 41, messageOpenedAt: 1 * minute };
    state.pending = [event("update")];
    await memory.store.save(state, "0");
    const send = vi.fn(async () => undefined);
    await runTick(config, { store: memory.store, now: () => 11 * minute, health: async () => [], metrics: async () => [], send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ phase: "update" }), expect.objectContaining({ messageId: undefined }));
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
