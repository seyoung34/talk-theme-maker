import { describe, expect, it } from "vitest";
import { applySamples, emptyState, formatNotification, type Policy, type Sample } from "./model";
const minute = 60000;
const policy: Policy = { failureChecks: 2, recoveryChecks: 2, cooldownMs: 5 * minute, repeatScheduleMs: [30 * minute, 60 * minute], runtimeFailureCount: 5, runtimeFailureRate: .05 };
const sample = (at: number, outcome: Sample["outcome"], source: Sample["source"] = "public_http"): Sample =>
  ({ source, outcome, at, code: "probe_ok", observationId: String(at) });
describe("independent incident state", () => {
  it("opens after consecutive failures, edits during cooldown windows, and recovers after consecutive success", () => {
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "failed")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened"]);
    // 고쳐 쓰기 간격(5분) 전에는 아무것도 쌓지 않는다.
    state = applySamples(state, [sample(3, "failed"), sample(5 * minute + 1, "failed")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened"]);
    state = applySamples(state, [sample(5 * minute + 2, "failed")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened", "update"]);
    state = applySamples(state, [sample(5 * minute + 3, "healthy"), sample(5 * minute + 4, "healthy")], policy);
    // 복구가 들어오면 아직 못 보낸 고쳐 쓰기는 의미가 없다.
    expect(state.pending.map(e => e.phase)).toEqual(["opened", "recovered"]);
    expect(state.incidents.public_http?.active).toBe(false);
  });
  it("sends new repeat messages on the escalating schedule and only edits in between", () => {
    const at = (m: number) => 2 + m * minute;
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "failed")], policy);
    for (let m = 5; m <= 150; m += 5) state = applySamples(state, [sample(at(m), "failed")], policy);
    const repeats = state.pending.filter(e => e.phase === "repeat").map(e => (e.at - 2) / minute);
    // 30분 뒤, 그 뒤 60분, 이후 마지막 간격(60분) 반복.
    expect(repeats).toEqual([30, 90, 150]);
    // 고쳐 쓰기는 같은 사건에 하나만 대기한다(최신 상태로 대체).
    expect(state.pending.filter(e => e.phase === "update")).toHaveLength(1);
    expect(state.pending.at(-1)?.phase).toBe("repeat");
    expect(state.incidents.public_http).toMatchObject({ reminders: 3, lastRemindedAt: at(150) });
  });
  it("resets the reminder count when a new incident opens", () => {
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "failed")], policy);
    state.incidents.public_http = { ...state.incidents.public_http!, reminders: 4 };
    state = applySamples(state, [sample(3, "healthy"), sample(4, "healthy"), sample(5, "failed"), sample(6, "failed")], policy);
    expect(state.incidents.public_http).toMatchObject({ active: true, openedAt: 6, reminders: 0, lastRemindedAt: 6 });
  });
  it("drops edits instead of crowding out incident transitions when the queue is backed up", () => {
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "failed")], policy);
    state.pending = Array.from({ length: 16 }, (_, i) => ({ id: String(i), source: "readiness" as const, phase: "opened" as const, at: i, openedAt: i, sample: sample(i, "failed", "readiness") }));
    state = applySamples(state, [sample(2 + 5 * minute, "failed")], policy);
    expect(state.pending.some(e => e.phase === "update")).toBe(false);
    expect(state.incidents.public_http?.lastQueuedAt).toBe(2);
  });
  it("does not count repeated GraphQL windows as separate failures", () => {
    const s = sample(100, "failed", "cloudflare_runtime");
    const state = applySamples(emptyState(), [s, s, s], policy);
    expect(state.pending).toHaveLength(1);
    expect(state.incidents.cloudflare_runtime?.failures).toBe(1);
  });
  it("allows a collection retry to replace unknown evidence for the same window", () => {
    const unavailable = sample(100, "unknown", "cloudflare_runtime");
    const observed = { ...unavailable, outcome: "failed" as const, at: 200 };
    const state = applySamples(emptyState(), [unavailable, observed], policy);
    expect(state.pending).toHaveLength(1);
    expect(state.incidents.cloudflare_runtime?.lastObservationId).toBe("100");
  });
  it("unknown evidence neither recovers nor bridges consecutive checks", () => {
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "unknown"), sample(3, "failed")], policy);
    expect(state.pending).toHaveLength(0);
    state = applySamples(state, [sample(4, "failed"), sample(5, "healthy"), sample(6, "unknown"), sample(7, "healthy")], policy);
    expect(state.incidents.public_http?.active).toBe(true);
    expect(state.pending.map(e => e.phase)).toEqual(["opened"]);
  });
  it("preserves queued events, bounds evidence, and refuses to silently evict alerts", () => {
    let state = emptyState();
    for (let i = 1; i < 160; i++) state = applySamples(state, [sample(i, "healthy")], policy);
    expect(state.evidence).toHaveLength(120);
    state.pending = Array.from({ length: 32 }, (_, i) => ({ id: String(i), source: "public_http", phase: "opened", at: i, openedAt: i, sample: sample(i, "failed") }));
    expect(() => applySamples(state, [sample(160, "failed"), sample(161, "failed")], policy)).toThrow("notification_queue_full");
    expect(state.pending).toHaveLength(32);
  });
  it("labels runtime evidence as invocation candidates, not CPU proof or user failure rate", () => {
    const state = applySamples(emptyState(), [{ ...sample(1, "failed", "cloudflare_runtime"), requests: 100, failures: 5 }], policy);
    const text = formatNotification(state.pending[0]);
    expect(text).toContain("CPU 원인 확정이 아닙니다");
    expect(text).toContain("사용자 수/HTTP 실패율이 아닙니다");
  });
});
