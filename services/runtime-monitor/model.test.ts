import { describe, expect, it } from "vitest";
import { applySamples, emptyState, formatNotification, type Policy, type Sample } from "./model";
const policy: Policy = { failureChecks: 2, recoveryChecks: 2, cooldownMs: 300000, runtimeFailureCount: 5, runtimeFailureRate: .05 };
const sample = (at: number, outcome: Sample["outcome"], source: Sample["source"] = "public_http"): Sample =>
  ({ source, outcome, at, code: "probe_ok", observationId: String(at) });
describe("independent incident state", () => {
  it("opens after consecutive failures, repeats only after cooldown, and recovers after consecutive success", () => {
    let state = applySamples(emptyState(), [sample(1, "failed"), sample(2, "failed")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened"]);
    state = applySamples(state, [sample(3, "failed"), sample(300002, "failed")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened", "repeat"]);
    state = applySamples(state, [sample(300003, "healthy"), sample(300004, "healthy")], policy);
    expect(state.pending.map(e => e.phase)).toEqual(["opened", "repeat", "recovered"]);
    expect(state.incidents.public_http?.active).toBe(false);
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
