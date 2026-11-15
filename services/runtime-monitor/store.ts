import { Storage } from "@google-cloud/storage";
import { emptyState, phases, sources, type MonitorState, type Phase } from "./model.js";
import { catalogByteLimit, defaultCatalog, parseMessageCatalog, type MessageCatalog } from "./messages.js";
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
      || (s.httpStatus !== undefined && (!Number.isInteger(s.httpStatus) || Number(s.httpStatus) < 100 || Number(s.httpStatus) > 599))
      || (s.cfRay !== undefined && (typeof s.cfRay !== "string" || !/^[a-f0-9]{16}-[A-Z]{3}$/i.test(s.cfRay)))
      || ["requests", "failures"].some(key => s[key] !== undefined && (typeof s[key] !== "number" || !Number.isFinite(s[key]) || Number(s[key]) < 0))) throw new Error("state_invalid");
  }
  for (const raw of state.pending) {
    const event = object(raw), sample = object(event.sample);
    if (event.source !== sample.source || !phases.includes(event.phase as Phase)
      || typeof event.id !== "string" || event.id !== `${event.source}:${event.openedAt}:${event.phase}:${event.at}`
      || !["at", "openedAt"].every(key => typeof event[key] === "number" && Number.isSafeInteger(event[key]) && Number(event[key]) >= 0)) throw new Error("state_invalid");
  }
  for (const raw of Object.values(object(state.incidents))) {
    const incident = object(raw);
    if (typeof incident.active !== "boolean" || !["failures", "successes", "openedAt", "lastQueuedAt"].every(key =>
      typeof incident[key] === "number" && Number.isSafeInteger(incident[key]) && Number(incident[key]) >= 0)
      || typeof incident.lastObservationId !== "string" || !/^\d{0,16}$/.test(incident.lastObservationId)
      // 아래 항목은 재알림·고쳐 쓰기 도입 뒤에 생겼다. 옛 상태 파일에는 없어도 된다.
      || ["reminders", "lastRemindedAt", "messageId", "messageOpenedAt"].some(key => incident[key] !== undefined
        && (typeof incident[key] !== "number" || !Number.isSafeInteger(incident[key]) || Number(incident[key]) < 0))) throw new Error("state_invalid");
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

export type MessageSource = () => Promise<MessageCatalog>;
export type MessageLog = (value: Record<string, string | number>) => void;

/**
 * 운영 문구 템플릿을 읽는다. 이 경로는 알림을 막으면 안 되므로 어떤 실패도 던지지 않고
 * 이미지에 든 원본 카탈로그로 돌아간다. 파일이 없는 것은 정상(원본 사용)이고 로그도 남기지 않는다.
 */
export async function readMessageCatalog(read: () => Promise<Buffer | null>, log: MessageLog): Promise<MessageCatalog> {
  let bytes: Buffer | null;
  try { bytes = await read(); } catch {
    log({ event: "monitor_messages_fallback", errorCode: "messages_read_failed" });
    return defaultCatalog;
  }
  if (bytes === null) return defaultCatalog;
  try {
    if (bytes.length > catalogByteLimit) throw new Error("messages_invalid: size");
    return parseMessageCatalog(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    // 경로만 남긴다. 문구 원문은 로그에 싣지 않는다.
    const detail = error instanceof Error && error.message.startsWith("messages_invalid: ") ? error.message.slice(18, 120) : "json";
    log({ event: "monitor_messages_fallback", errorCode: "messages_invalid", detail });
    return defaultCatalog;
  }
}

export function createGcsMessageSource(bucket: string, objectName: string, log: MessageLog): MessageSource {
  const storage = new Storage({ retryOptions: { autoRetry: false }, timeout: 5000 });
  return () => readMessageCatalog(async () => {
    const file = storage.bucket(bucket).file(objectName);
    try {
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > catalogByteLimit) return Buffer.alloc(catalogByteLimit + 1);
      const [bytes] = await storage.bucket(bucket).file(objectName, { generation: String(metadata.generation) }).download();
      return bytes;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 404) return null;
      throw error;
    }
  }, log);
}
