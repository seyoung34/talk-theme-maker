import type { Source } from "./sources.js";
export { sources, type Source } from "./sources.js";
export type Outcome = "healthy" | "failed" | "unknown";
export type Sample = {
  source: Source; outcome: Outcome; code: string; observationId: string; at: number;
  requests?: number; failures?: number;
  httpStatus?: number; cfRay?: string;
};
export type Policy = {
  failureChecks: number; recoveryChecks: number;
  /** 같은 사건의 장애 메시지를 고쳐 쓰는(update) 최소 간격. 새 메시지는 보내지 않는다. */
  cooldownMs: number;
  /**
   * 새 "장애 지속" 메시지를 보내는 간격. n번째 재알림은 직전 알림에서 repeatScheduleMs[n]만큼 지난 뒤에
   * 나가고, 목록 끝에 닿으면 마지막 간격을 반복한다.
   */
  repeatScheduleMs: number[];
  runtimeFailureCount: number; runtimeFailureRate: number;
};
export type Incident = {
  active: boolean; failures: number; successes: number; openedAt: number;
  lastQueuedAt: number; lastObservationId: string;
  /** 이 사건에서 보낸 "장애 지속" 메시지 수와 마지막 시각. 옛 상태 파일에는 없다. */
  reminders?: number; lastRemindedAt?: number;
  /** 고쳐 쓸 텔레그램 메시지. 이 사건(openedAt)의 "장애 감지" 메시지가 전송된 뒤에만 생긴다. */
  messageId?: number; messageOpenedAt?: number;
};
export type Phase = "opened" | "repeat" | "update" | "recovered";
export const phases: readonly Phase[] = ["opened", "repeat", "update", "recovered"];
export type Notification = {
  id: string; source: Source; phase: Phase;
  at: number; openedAt: number; sample: Sample;
};
/** 고쳐 쓰기는 버려도 되는 알림이다. 큐가 이만큼 차 있으면 새로 쌓지 않는다. */
export const updateQueueLimit = 16;
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
        incident.reminders = 0; incident.lastRemindedAt = sample.at;
        delete incident.messageId; delete incident.messageOpenedAt;
      } else if (incident.active) {
        const reminders = incident.reminders ?? 0;
        const schedule = policy.repeatScheduleMs;
        const interval = schedule[Math.min(reminders, schedule.length - 1)];
        if (sample.at - (incident.lastRemindedAt ?? incident.openedAt) >= interval) {
          phase = "repeat"; incident.reminders = reminders + 1; incident.lastRemindedAt = sample.at;
        } else if (sample.at - incident.lastQueuedAt >= policy.cooldownMs) {
          phase = "update";
        }
      }
    } else {
      incident.successes++; incident.failures = 0;
      if (incident.active && incident.successes >= policy.recoveryChecks) {
        incident.active = false; phase = "recovered";
      }
    }
    if (phase) {
      // 고쳐 쓰기는 최신 상태 하나만 의미가 있다. 아직 못 보낸 같은 사건의 고쳐 쓰기는 새 것으로 대체하고,
      // 큐가 밀려 있으면 쌓지 않는다. 사건을 여닫는 알림이 들어갈 자리를 먼저 지킨다.
      if (phase === "update" || phase === "recovered") {
        next.pending = next.pending.filter(e => !(e.phase === "update" && e.source === sample.source && e.openedAt === incident.openedAt));
      }
      if (phase === "update" && next.pending.length >= updateQueueLimit) { phase = undefined; continue; }
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
