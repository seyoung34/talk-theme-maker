import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { emptyState, type MonitorState, type Sample, type Notification } from "./model";
import { runTick } from "./runner";
import type { StateStore } from "./store";
const config = readConfig({
  MONITOR_TARGET_ORIGIN: "https://site.test", MONITOR_CF_ACCOUNT_TAG: "a".repeat(32),
  MONITOR_CF_SCRIPT_NAME: "talk-theme-maker", MONITOR_READINESS_TOKEN: "r".repeat(32),
  MONITOR_STATE_BUCKET: "fixture-bucket", MONITOR_CF_API_TOKEN: "private-token",
  MONITOR_FAILURE_CHECKS: "2", MONITOR_RECOVERY_CHECKS: "2", MONITOR_COOLDOWN_SECONDS: "300",
  MONITOR_RUNTIME_FAILURE_COUNT: "5", MONITOR_RUNTIME_FAILURE_PERCENT: "5",
});
const sample = (at: number, outcome: Sample["outcome"], source: Sample["source"] = "public_http"): Sample =>
  ({ source, at, outcome, observationId: String(at), code: "probe_ok" });
function memoryStore() {
  let state = emptyState(), generation = 0;
  const store: StateStore = {
    load: vi.fn(async () => ({ state: structuredClone(state), generation: String(generation) })),
    save: vi.fn(async (next, expected) => {
      if (expected !== String(generation)) throw new Error("cas_conflict");
      state = structuredClone(next); return String(++generation);
    }),
  };
  return { store, read: () => structuredClone(state), seed: (next: MonitorState) => { state = next; } };
}
const metrics = async (at: number): Promise<Sample[]> => [
  { ...sample(at, "healthy", "cloudflare_collector"), code: "collection_ok" },
  { ...sample(at, "healthy", "cloudflare_runtime"), observationId: String(Math.floor((at - 120000) / 300000) * 300000), requests: 10, failures: 0 },
];
describe("durable independent monitor coordinator", () => {
  it("clears fifteen-minute collection backoff on success while preserving missed-window evidence", async () => {
    const memory = memoryStore(), log = vi.fn(), health = async (at: number) => [sample(at, "healthy")];
    const collect = vi.fn(metrics);
    const run = (at: number) => runTick(config, { store: memory.store, now: () => at, health, metrics: collect, log });
    await run(1060000);
    collect.mockImplementation(async at => [
      { ...sample(at, "failed", "cloudflare_collector"), code: "collection_failed" },
      { ...sample(at, "unknown", "cloudflare_runtime"), code: "collection_unavailable" },
    ]);
    for (const at of [1360000, 1420000, 1540000, 1780000, 2260000]) await run(at);
    expect(memory.read().incidents.cloudflare_collector).toMatchObject({ active: true, failures: 5 });
    collect.mockImplementation(metrics);
    await run(3160000);
    expect(memory.read().incidents.cloudflare_collector).toMatchObject({ active: true, failures: 0, successes: 1 });
    expect(memory.read().evidence).toContainEqual(expect.objectContaining({ source: "cloudflare_runtime", outcome: "unknown", code: "collection_gap" }));
    expect(memory.read().evidence.filter(s => s.source === "cloudflare_collector").at(-1)?.code).toBe("collection_ok");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "monitor_collection_gap", missingWindows: 6 }));
    const calls = collect.mock.calls.length;
    await run(3220000);
    expect(collect).toHaveBeenCalledTimes(calls); // same successful window is still queried only once
    await run(3460000); // next window succeeds before the former 15-minute backoff
    expect(collect).toHaveBeenCalledTimes(calls + 1);
    expect(memory.read().incidents.cloudflare_collector).toMatchObject({ active: false, failures: 0 });
    expect(memory.read().pending.filter(e => e.source === "cloudflare_collector").at(-1)?.phase).toBe("recovered");
  });

  it("does not join successful runtime windows across a thirty-minute observation gap", async () => {
    const memory = memoryStore(), collect = vi.fn(async (at: number) => {
      const samples = await metrics(at);
      samples[1] = { ...samples[1], outcome: "failed", code: "runtime_failure_candidates", requests: 10, failures: 5 };
      return samples;
    });
    const run = (at: number) => runTick(config, { store: memory.store, now: () => at, health: async now => [sample(now, "healthy")], metrics: collect, log: vi.fn() });
    await run(1060000);
    collect.mockImplementation(metrics);
    await run(1360000);
    expect(memory.read().incidents.cloudflare_runtime).toMatchObject({ active: true, successes: 1 });
    await run(3160000);
    expect(memory.read().incidents.cloudflare_runtime).toMatchObject({ active: true, successes: 1, failures: 0 });
    expect(memory.read().pending.filter(e => e.source === "cloudflare_runtime").map(e => e.phase)).toEqual(["opened"]);
    const evidence = memory.read().evidence.filter(s => s.source === "cloudflare_runtime");
    expect(evidence.slice(-2).map(s => [s.code, s.outcome])).toEqual([["collection_gap", "unknown"], ["probe_ok", "healthy"]]);
    await run(3460000);
    expect(memory.read().incidents.cloudflare_runtime?.active).toBe(false);
    expect(memory.read().pending.filter(e => e.source === "cloudflare_runtime").map(e => e.phase)).toEqual(["opened", "recovered"]);
  });

  it("uses durable incident history when prior window evidence has been evicted during long downtime", async () => {
    const memory = memoryStore();
    memory.seed({
      ...emptyState(),
      incidents: { cloudflare_runtime: {
        active: true, successes: 1, failures: 0, openedAt: 1060000,
        lastQueuedAt: 1060000, lastObservationId: "900000",
      } },
      evidence: Array.from({ length: 120 }, (_, i) => sample(2000000 + i, "healthy")),
    });
    await runTick(config, { store: memory.store, now: () => 7060000, health: async () => [], metrics, log: vi.fn() });
    expect(memory.read().incidents.cloudflare_runtime).toMatchObject({ active: true, successes: 1 });
    expect(memory.read().evidence).toContainEqual(expect.objectContaining({ code: "collection_gap", outcome: "unknown" }));
    expect(memory.read().pending).toHaveLength(0);
  });

  it("breaks failed runtime streaks across gaps even when the collected window has unclassified outcomes", async () => {
    const memory = memoryStore();
    memory.seed({
      ...emptyState(), incidents: { cloudflare_runtime: {
        active: true, successes: 0, failures: 3, openedAt: 1060000,
        lastQueuedAt: 3160000, lastObservationId: "900000",
      } },
    });
    await runTick(config, {
      store: memory.store, now: () => 3160000, health: async () => [], log: vi.fn(),
      metrics: async at => [
        { ...sample(at, "failed", "cloudflare_collector"), code: "unclassified_outcome" },
        { ...sample(at, "failed", "cloudflare_runtime"), code: "runtime_failure_candidates", observationId: "3000000", requests: 10, failures: 5 },
      ],
    });
    expect(memory.read().incidents.cloudflare_runtime).toMatchObject({ active: true, failures: 1, successes: 0 });
    expect(memory.read().incidents.cloudflare_collector?.failures).toBe(1);
  });

  it("persists incident before delivery, retries the same alert after failure, then emits recovery", async () => {
    const memory = memoryStore(), log = vi.fn(), send = vi.fn<(event: Notification) => Promise<void>>(async () => {
      expect(memory.read().pending).toHaveLength(1);
      throw new Error("private-telegram-response");
    });
    const cfg = { ...config, alertsEnabled: true };
    const run = (at: number, outcome: Sample["outcome"]) => runTick(cfg, {
      store: memory.store, now: () => at, health: async now => [sample(now, outcome)], metrics, send, log,
    });
    await run(1000000, "failed");
    await run(1060000, "failed");
    const queued = memory.read().pending[0];
    expect(queued.phase).toBe("opened");
    expect(memory.read().lease).toBeUndefined();
    send.mockImplementation(async () => undefined);
    await run(1120000, "healthy");
    expect(send.mock.calls[1][0]).toEqual(queued);
    await run(1180000, "healthy");
    expect(send.mock.calls.at(-1)?.[0].phase).toBe("recovered");
    expect(memory.read().pending).toHaveLength(0);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  it("allows only one concurrent lease holder to perform probes", async () => {
    const memory = memoryStore(), health = vi.fn(async now => [sample(now, "healthy")]);
    const results = await Promise.allSettled([1, 2].map(() => runTick(config, { store: memory.store, now: () => 1000000, health, metrics, log: vi.fn() })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(health).toHaveBeenCalledOnce();
  });
  it("active lease skips probes and an expired lease can be taken over", async () => {
    const memory = memoryStore(), health = vi.fn(async now => [sample(now, "healthy")]);
    memory.seed({ ...emptyState(), lease: { owner: crypto.randomUUID(), until: 1060000 } });
    expect(await runTick(config, { store: memory.store, now: () => 1000000, health, metrics })).toMatchObject({ skipped: true });
    expect(health).not.toHaveBeenCalled();
    await runTick(config, { store: memory.store, now: () => 1120000, health, metrics, log: vi.fn() });
    expect(health).toHaveBeenCalledOnce();
  });
  it("stops before sending when work outlives the lease", async () => {
    const memory = memoryStore(), send = vi.fn();
    let now = 1000000;
    await expect(runTick({ ...config, alertsEnabled: true }, {
      store: memory.store, now: () => now, health: async at => { now += 120000; return [sample(at, "failed")]; }, metrics, send,
    })).rejects.toThrow("monitor_lease_expired");
    expect(send).not.toHaveBeenCalled();
    expect(memory.read().lastCompletedAt).toBe(0);
  });
  it("successful window is fetched once; collection failures back off without blocking HTTP probes", async () => {
    const memory = memoryStore(), collect = vi.fn(metrics), health = vi.fn(async at => [sample(at, "healthy")]);
    for (const now of [1060000, 1120000]) await runTick(config, { store: memory.store, now: () => now, health, metrics: collect, log: vi.fn() });
    expect(collect).toHaveBeenCalledOnce();
    collect.mockImplementation(async at => [
      { ...sample(at, "failed", "cloudflare_collector"), code: "collection_failed" },
      { ...sample(at, "unknown", "cloudflare_runtime"), code: "collection_unavailable" },
    ]);
    for (const now of [1360000, 1420000, 1480000]) await runTick(config, { store: memory.store, now: () => now, health, metrics: collect, log: vi.fn() });
    expect(collect).toHaveBeenCalledTimes(3);
    expect(health).toHaveBeenCalledTimes(5);
    expect(memory.read().incidents.cloudflare_collector?.active).toBe(true);
  });
  it("state persistence failure never sends an uncommitted notification", async () => {
    const memory = memoryStore(), send = vi.fn();
    memory.store.save = vi.fn().mockRejectedValue(new Error("storage-private-error"));
    await expect(runTick({ ...config, alertsEnabled: true }, { store: memory.store, send })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("emits actual JSON stdout for Cloud Logging heartbeat extraction", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await runTick(config, { store: memoryStore().store, now: () => 1060000, health: async now => [sample(now, "healthy")], metrics });
      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ event: "monitor_tick_completed", at: 1060000 });
    } finally { log.mockRestore(); }
  });
  it("drains a saturated outbox after Telegram recovers, then resumes observation without evicting queued events", async () => {
    const memory = memoryStore();
    const state = emptyState();
    state.pending = Array.from({ length: 32 }, (_, i) => ({
      id: `public_http:${i}:opened:${i}`, source: "public_http", phase: "opened",
      at: i, openedAt: i, sample: sample(i, "failed"),
    }));
    memory.seed(state);
    const send = vi.fn<(event: Notification) => Promise<void>>().mockRejectedValue(new Error("provider_down"));
    const health = vi.fn(async at => [sample(at, "failed")]), log = vi.fn();
    const run = (at: number) => runTick({ ...config, alertsEnabled: true }, { store: memory.store, now: () => at, health, metrics, send, log });
    expect(await run(1060000)).toMatchObject({ queueBackpressure: true, deliveryFailed: true });
    expect(memory.read().pending).toHaveLength(32);
    expect(memory.read().lease).toBeUndefined();
    expect(health).not.toHaveBeenCalled();
    send.mockResolvedValue(undefined);
    expect(await run(1120000)).toMatchObject({ queueBackpressure: true });
    expect(memory.read().pending).toHaveLength(29);
    expect(health).not.toHaveBeenCalled();
    await run(1180000);
    expect(memory.read().pending).toHaveLength(26);
    expect(health).toHaveBeenCalledOnce();
    await run(1240000);
    expect(memory.read().pending).toHaveLength(24);
    expect(memory.read().pending.at(-1)?.phase).toBe("opened");
    expect(send.mock.calls.slice(1).map(call => call[0].id)).toEqual(state.pending.slice(0, 9).map(event => event.id));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "monitor_tick_failed", errorCode: "notification_queue_backpressure" }));
  });
});
