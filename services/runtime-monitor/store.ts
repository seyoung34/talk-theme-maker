import { Storage } from "@google-cloud/storage";
import { emptyState, sources, type MonitorState } from "./model.js";
import { object } from "./http.js";

export type Snapshot = { state: MonitorState; generation: string };
export interface StateStore {
  load(): Promise<Snapshot>;
  save(state: MonitorState, generation: string): Promise<string>;
}

export function validateState(value: unknown): MonitorState {
  const state = object(value);
  if (state.version !== 1 || !Array.isArray(state.pending) || state.pending.length > 32
    || !Array.isArray(state.evidence) || state.evidence.length > 120
    || typeof state.lastCompletedAt !== "number" || !Number.isFinite(state.lastCompletedAt)
    || Object.keys(object(state.incidents)).some(key => !sources.includes(key as typeof sources[number]))) throw new Error("state_invalid");
  // Existing state is trusted only after its complete, bounded schema is checked.
  for (const sample of [...state.evidence, ...state.pending.map(raw => object(raw).sample)]) {
    const s = object(sample);
    if (!sources.includes(s.source as typeof sources[number]) || !["healthy", "failed", "unknown"].includes(String(s.outcome))
      || typeof s.code !== "string" || !/^[a-z_]{1,64}$/.test(s.code)
      || typeof s.observationId !== "string" || !/^\d{1,16}$/.test(s.observationId)
      || typeof s.at !== "number" || !Number.isSafeInteger(s.at) || s.at < 0
      || ["requests", "failures"].some(key => s[key] !== undefined && (typeof s[key] !== "number" || !Number.isFinite(s[key]) || Number(s[key]) < 0))) throw new Error("state_invalid");
  }
  for (const raw of state.pending) {
    const event = object(raw), sample = object(event.sample);
    if (event.source !== sample.source || !["opened", "repeat", "recovered"].includes(String(event.phase))
      || typeof event.id !== "string" || event.id !== `${event.source}:${event.openedAt}:${event.phase}:${event.at}`
      || !["at", "openedAt"].every(key => typeof event[key] === "number" && Number.isSafeInteger(event[key]) && Number(event[key]) >= 0)) throw new Error("state_invalid");
  }
  for (const raw of Object.values(object(state.incidents))) {
    const incident = object(raw);
    if (typeof incident.active !== "boolean" || !["failures", "successes", "openedAt", "lastQueuedAt"].every(key =>
      typeof incident[key] === "number" && Number.isSafeInteger(incident[key]) && Number(incident[key]) >= 0)
      || typeof incident.lastObservationId !== "string" || !/^\d{0,16}$/.test(incident.lastObservationId)) throw new Error("state_invalid");
  }
  if (state.lease !== undefined) {
    const lease = object(state.lease);
    if (typeof lease.owner !== "string" || !/^[a-f0-9-]{36}$/.test(lease.owner)
      || typeof lease.until !== "number" || !Number.isSafeInteger(lease.until)) throw new Error("state_invalid");
  }
  return value as MonitorState;
}

export function createGcsStore(bucket: string, objectName: string): StateStore {
  // No automatic write retry: CAS conflicts must reach the coordinator.
  const storage = new Storage({ retryOptions: { autoRetry: false }, timeout: 5000 });
  return {
    async load() {
      const file = storage.bucket(bucket).file(objectName);
      try {
        const [metadata] = await file.getMetadata();
        const generation = String(metadata.generation);
        if (!/^\d+$/.test(generation) || !Number.isFinite(Number(metadata.size)) || Number(metadata.size) > 262144) throw new Error("state_invalid");
        // Read the SAME immutable generation whose metadata was observed.
        const version = storage.bucket(bucket).file(objectName, { generation });
        const [bytes] = await version.download();
        if (bytes.length > 262144) throw new Error("state_invalid");
        return { state: validateState(JSON.parse(bytes.toString("utf8"))), generation };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 404) {
          // A version disappearing during read must not be mistaken for an empty store.
          // Confirm the live object is also absent before allowing create-only CAS.
          const [exists] = await file.exists();
          if (!exists) return { state: emptyState(), generation: "0" };
        }
        throw new Error("state_read_failed");
      }
    },
    async save(state, generation) {
      const file = storage.bucket(bucket).file(objectName);
      validateState(state);
      const serialized = JSON.stringify(state);
      if (Buffer.byteLength(serialized) > 262144) throw new Error("state_invalid");
      try {
        await file.save(serialized, {
          resumable: false, timeout: 5000, contentType: "application/json",
          preconditionOpts: { ifGenerationMatch: generation },
        });
        // The save response populates metadata; do not read a possibly newer live generation.
        const nextGeneration = String(file.metadata.generation);
        if (!/^\d+$/.test(nextGeneration)) throw new Error("state_invalid");
        return nextGeneration;
      } catch { throw new Error("state_write_failed"); }
    },
  };
}
