import type { Config } from "./config.js";
import { collectHealth, collectMetrics, metricsWindow } from "./collect.js";
import { applySamples, formatNotification, type Notification, type Sample } from "./model.js";
import { MonitorHttpError, object, readBoundedJson, requestData } from "./http.js";
import { defaultCatalog, type MessageCatalog } from "./messages.js";
import type { StateStore } from "./store.js";

type Dependencies = {
  store: StateStore; now?: () => number; owner?: string;
  health?: (now: number) => Promise<Sample[]>; metrics?: (now: number) => Promise<Sample[]>;
  /** 알림 한 건을 보낸다. 새 메시지를 보냈으면 그 텔레그램 message_id를 돌려준다. */
  send?: (event: Notification, context: DeliveryContext) => Promise<number | void>;
  messages?: () => Promise<MessageCatalog>;
  log?: (value: Record<string, string | number>) => void;
};

export type DeliveryContext = {
  catalog: MessageCatalog;
  /** 이 사건의 "장애 감지" 메시지. 지속·복구 알림은 여기에 답장하고, 고쳐 쓰기는 이 메시지를 바꾼다. */
  messageId?: number;
};

type TelegramResult = { message_id?: unknown };

async function callTelegram(config: Config, method: "sendMessage" | "editMessageText", body: Record<string, unknown>, fetcher: typeof fetch) {
  return requestData(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, link_preview_options: { is_disabled: true }, ...body }),
  }, async response => {
    const payload = object(await readBoundedJson(response));
    if (payload.ok !== true) throw new Error("notification_rejected");
    return (payload.result && typeof payload.result === "object" ? payload.result : {}) as TelegramResult;
  }, fetcher);
}

/** 고쳐 쓰기의 400은 다시 보내도 성공하지 않는다(내용 동일, 메시지 삭제됨, 48시간 경과 등). */
function isPermanentEditFailure(error: unknown) {
  return error instanceof MonitorHttpError && error.code === "http_failed" && error.httpStatus === 400;
}

async function editMessage(config: Config, messageId: number, text: string, fetcher: typeof fetch) {
  try {
    await callTelegram(config, "editMessageText", { message_id: messageId, text }, fetcher);
  } catch (error) {
    if (!isPermanentEditFailure(error)) throw error;
  }
}

export async function sendNotification(config: Config, event: Notification, context: DeliveryContext = { catalog: defaultCatalog }, fetcher: typeof fetch = fetch): Promise<number | void> {
  const { catalog, messageId } = context;
  if (event.phase === "update") {
    // 고칠 메시지가 없으면(전송 전 장애였거나 알림이 꺼져 있던 사건) 조용히 버린다.
    if (messageId !== undefined) await editMessage(config, messageId, formatNotification(event, catalog), fetcher);
    return;
  }
  const result = await callTelegram(config, "sendMessage", {
    text: formatNotification(event, catalog),
    ...(messageId !== undefined && event.phase !== "opened"
      ? { reply_parameters: { message_id: messageId, allow_sending_without_reply: true } } : {}),
  }, fetcher);
  if (event.phase === "recovered" && messageId !== undefined) {
    // 복구 알림은 이미 전달됐다. 처음 메시지를 종료 상태로 바꾸는 일은 실패해도 다시 보내지 않는다.
    await editMessage(config, messageId, formatNotification(event, catalog, "closed"), fetcher).catch(() => undefined);
  }
  return typeof result.message_id === "number" && Number.isSafeInteger(result.message_id) ? result.message_id : undefined;
}

export async function runTick(config: Config, dependencies: Dependencies) {
  const clock = dependencies.now ?? Date.now;
  const startedAt = clock(), owner = dependencies.owner ?? crypto.randomUUID();
  // Cloud Run stdout must be JSON text to populate Cloud Logging jsonPayload.
  const log = dependencies.log ?? (value => console.log(JSON.stringify(value)));
  let { state, generation } = await dependencies.store.load();
  if (state.lease && state.lease.until > startedAt) return { skipped: true, pending: state.pending.length };
  state.lease = { owner, until: startedAt + 120000 };
  generation = await dependencies.store.save(state, generation);
  const ensureLease = () => {
    // Every effect is bounded by five seconds; stop well before another holder can acquire.
    if (clock() + 15000 >= state.lease!.until) throw new Error("monitor_lease_expired");
  };
  ensureLease();
  let deliveryFailed = false, deliveryCount = 0;
  let catalog: MessageCatalog | undefined;
  const drain = async () => {
    if (!config.alertsEnabled || deliveryFailed) return;
    while (deliveryCount < 3 && state.pending.length) {
      ensureLease();
      const event = state.pending[0];
      catalog ??= await (dependencies.messages?.() ?? Promise.resolve(defaultCatalog));
      ensureLease();
      const incident = state.incidents[event.source];
      const messageId = incident?.messageOpenedAt === event.openedAt ? incident.messageId : undefined;
      let sentId: number | void;
      try {
        sentId = await (dependencies.send ?? ((notification, context) => sendNotification(config, notification, context)))(event, { catalog, messageId });
      } catch {
        log({ event: "monitor_delivery_failed", errorCode: "notification_delivery_failed", pending: state.pending.length });
        deliveryFailed = true; return;
      }
      ensureLease();
      state.pending.shift();
      // 사건의 첫 메시지만 고쳐 쓰기 대상이다. 그 사이 사건이 다시 열렸다면 옛 메시지를 붙이지 않는다.
      const current = state.incidents[event.source];
      if (event.phase === "opened" && typeof sentId === "number" && current && current.openedAt === event.openedAt) {
        current.messageId = sentId; current.messageOpenedAt = event.openedAt;
      }
      // Telegram has no idempotency key. An ack crash can duplicate this event ID.
      generation = await dependencies.store.save(state, generation);
      deliveryCount++;
    }
  };
  // Drain committed alerts first, even when new observations would fill the queue.
  await drain();
  if (state.pending.length > 27) {
    // Reserve room for one transition per each of five sources. Do not observe
    // new incidents we cannot persist; mark the coverage gap/backpressure instead.
    ensureLease();
    delete state.lease;
    await dependencies.store.save(state, generation);
    log({ event: "monitor_tick_failed", errorCode: "notification_queue_backpressure", pending: state.pending.length });
    return { skipped: false, pending: state.pending.length, deliveryFailed, queueBackpressure: true };
  }
  const window = metricsWindow(startedAt);
  const lastMetrics = state.evidence.filter(s => s.source === "cloudflare_runtime" && !["collection_unavailable", "collection_gap"].includes(s.code)).at(-1);
  // The bounded evidence ring can evict an older window during long downtime.
  // Its last known healthy/failed observation still lives in the incident state.
  const previousWindow = lastMetrics?.observationId || state.incidents.cloudflare_runtime?.lastObservationId;
  const collector = state.incidents.cloudflare_collector;
  const backoffMs = collector?.failures ? Math.min(900000, 60000 * 2 ** Math.min(collector.failures - 1, 4)) : 0;
  const lastCollector = state.evidence.filter(s => s.source === "cloudflare_collector").at(-1);
  const shouldCollect = previousWindow !== window.id
    && (!lastCollector || startedAt - lastCollector.at >= backoffMs);
  const [health, metrics] = await Promise.all([
    (dependencies.health ?? (now => collectHealth(config, now)))(startedAt),
    shouldCollect ? (dependencies.metrics ?? (now => collectMetrics(config, now)))(startedAt) : Promise.resolve([]),
  ]);
  const observed = metrics.find(s => s.source === "cloudflare_runtime" && s.code !== "collection_unavailable");
  const gap: Sample[] = [];
  // Transport success clears collector backoff. Missing historical windows are
  // separate unknown evidence, breaking runtime streaks BEFORE the new window.
  if (observed && previousWindow && Number(window.id) - Number(previousWindow) > 300000) {
    gap.push({ source: "cloudflare_runtime", outcome: "unknown", code: "collection_gap",
      at: startedAt, observationId: window.id });
    log({ event: "monitor_collection_gap", at: startedAt,
      previousWindow: Number(previousWindow), currentWindow: Number(window.id),
      missingWindows: (Number(window.id) - Number(previousWindow)) / 300000 - 1 });
  }
  state = applySamples(state, [...health, ...gap, ...metrics], config.policy);
  ensureLease();
  // Persist incident/outbox BEFORE sending; a process crash cannot lose a queued alert.
  generation = await dependencies.store.save(state, generation);
  await drain();
  ensureLease();
  state.lastCompletedAt = clock();
  delete state.lease;
  await dependencies.store.save(state, generation);
  log({ event: "monitor_tick_completed", at: state.lastCompletedAt, pending: state.pending.length, samples: health.length + metrics.length });
  return { skipped: false, pending: state.pending.length, deliveryFailed };
}
