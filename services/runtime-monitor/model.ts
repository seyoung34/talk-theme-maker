export const sources = ["public_http", "session_http", "readiness", "cloudflare_runtime", "cloudflare_collector"] as const;
export type Source = typeof sources[number];
export type Outcome = "healthy" | "failed" | "unknown";
export type Sample = {
  source: Source; outcome: Outcome; code: string; observationId: string; at: number;
  requests?: number; failures?: number;
};
export type Policy = {
  failureChecks: number; recoveryChecks: number; cooldownMs: number;
  runtimeFailureCount: number; runtimeFailureRate: number;
};
export type Incident = {
  active: boolean; failures: number; successes: number; openedAt: number;
  lastQueuedAt: number; lastObservationId: string;
};
export type Notification = {
  id: string; source: Source; phase: "opened" | "repeat" | "recovered";
  at: number; openedAt: number; sample: Sample;
};
export type MonitorState = {
  version: 1; incidents: Partial<Record<Source, Incident>>; pending: Notification[];
  evidence: Sample[]; lastCompletedAt: number; lease?: { owner: string; until: number };
};

export function emptyState(): MonitorState {
  return { version: 1, incidents: {}, pending: [], evidence: [], lastCompletedAt: 0 };
}

// Policy is injected: these are not silently approved production thresholds.
export function applySamples(state: MonitorState, samples: Sample[], policy: Policy): MonitorState {
  const next = structuredClone(state);
  for (const sample of samples) {
    const incident = next.incidents[sample.source] ?? {
      active: false, failures: 0, successes: 0, openedAt: 0, lastQueuedAt: 0, lastObservationId: "",
    };
    // A five-minute GraphQL window may be read by several one-minute ticks.
    if (incident.lastObservationId === sample.observationId) continue;
    // Failed collection must not consume the window ID before a retry can observe it.
    if (sample.outcome !== "unknown") incident.lastObservationId = sample.observationId;
    next.incidents[sample.source] = incident;
    next.evidence.push(sample);
    next.evidence = next.evidence.slice(-120);
    if (sample.outcome === "unknown") {
      // Missing evidence must neither recover an incident nor count as consecutive success/failure.
      incident.failures = 0; incident.successes = 0;
      continue;
    }
    let phase: Notification["phase"] | undefined;
    if (sample.outcome === "failed") {
      incident.failures++; incident.successes = 0;
      if (!incident.active && incident.failures >= (sample.source === "cloudflare_runtime" ? 1 : policy.failureChecks)) {
        incident.active = true; incident.openedAt = sample.at; phase = "opened";
      } else if (incident.active && sample.at - incident.lastQueuedAt >= policy.cooldownMs) {
        phase = "repeat";
      }
    } else {
      incident.successes++; incident.failures = 0;
      if (incident.active && incident.successes >= policy.recoveryChecks) {
        incident.active = false; phase = "recovered";
      }
    }
    if (phase) {
      if (next.pending.length >= 32) throw new Error("notification_queue_full");
      incident.lastQueuedAt = sample.at;
      next.pending.push({
        id: `${sample.source}:${incident.openedAt}:${phase}:${sample.at}`,
        source: sample.source, phase, at: sample.at, openedAt: incident.openedAt, sample,
      });
    }
  }
  return next;
}

// 문구는 사람이 읽는 영역이라 상태 전이와 따로 둔다. runner는 계속 여기서 가져간다.
export { formatNotification } from "./format.js";
