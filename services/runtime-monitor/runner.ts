import type { Config } from "./config.js";
import { collectHealth, collectMetrics, metricsWindow } from "./collect.js";
import { applySamples, formatNotification, type Notification, type Sample } from "./model.js";
import { object, readBoundedJson, requestData } from "./http.js";
import type { StateStore } from "./store.js";

type Dependencies = {
  store: StateStore; now?: () => number; owner?: string;
  health?: (now: number) => Promise<Sample[]>; metrics?: (now: number) => Promise<Sample[]>;
  send?: (event: Notification) => Promise<void>;
  log?: (value: Record<string, string | number>) => void;
};

export async function sendNotification(config: Config, event: Notification, fetcher: typeof fetch = fetch) {
  await requestData(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, text: formatNotification(event), disable_web_page_preview: true }),
  }, async response => {
    const payload = object(await readBoundedJson(response));
    if (payload.ok !== true) throw new Error("notification_rejected");
  }, fetcher);
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
  const drain = async () => {
    if (!config.alertsEnabled || deliveryFailed) return;
    while (deliveryCount < 3 && state.pending.length) {
      ensureLease();
      const event = state.pending[0];
      try {
        await (dependencies.send ?? (notification => sendNotification(config, notification)))(event);
      } catch {
        log({ event: "monitor_delivery_failed", errorCode: "notification_delivery_failed", pending: state.pending.length });
        deliveryFailed = true; return;
      }
      ensureLease();
      state.pending.shift();
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
  const lastMetrics = state.evidence.filter(s => s.source === "cloudflare_runtime" && s.code !== "collection_unavailable").at(-1);
  const collector = state.incidents.cloudflare_collector;
  const backoffMs = collector?.failures ? Math.min(900000, 60000 * 2 ** Math.min(collector.failures - 1, 4)) : 0;
  const lastCollector = state.evidence.filter(s => s.source === "cloudflare_collector").at(-1);
  const shouldCollect = lastMetrics?.observationId !== window.id
    && (!lastCollector || startedAt - lastCollector.at >= backoffMs);
  const [health, metrics] = await Promise.all([
    (dependencies.health ?? (now => collectHealth(config, now)))(startedAt),
    shouldCollect ? (dependencies.metrics ?? (now => collectMetrics(config, now)))(startedAt) : Promise.resolve([]),
  ]);
  const collected = metrics.find(s => s.source === "cloudflare_collector");
  // A latest-window collector does not fabricate successful coverage over downtime.
  if (collected?.outcome === "healthy" && lastMetrics && Number(window.id) - Number(lastMetrics.observationId) > 300000) {
    collected.outcome = "failed"; collected.code = "collection_gap";
  }
  state = applySamples(state, [...health, ...metrics], config.policy);
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
