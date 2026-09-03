export const opsEventTypes = [
  "export.enqueue_failed",
  "export.failed",
  "export.watchdog_timeout",
  "export.failure_spike",
  "billing.webhook_rejected",
  "billing.webhook_processing_failed",
  "billing.refund_failed",
  "runtime.health_failed",
  "admin.template_published",
  "ops.daily_summary",
] as const;

export type OpsEventType = (typeof opsEventTypes)[number];
export type OpsSeverity = "P1" | "P2" | "P3";
export type OpsSource = "export" | "billing" | "runtime" | "admin" | "ops";
export type OpsEntityKind = "export_job" | "payment" | "template" | "runtime";
export type OpsDetailValue = string | number | boolean | null;

export type OpsEvent = {
  eventId: string;
  type: OpsEventType;
  severity: OpsSeverity;
  source: OpsSource;
  occurredAt: string;
  entity?: { kind: OpsEntityKind; id: string };
  summary: string;
  details: Record<string, OpsDetailValue>;
  dedupeKey: string;
  adminPath?: string;
};

export type CreateOpsEventInput = {
  eventId?: string;
  type: OpsEventType;
  severity: OpsSeverity;
  source: OpsSource;
  occurredAt?: string;
  entity?: { kind: OpsEntityKind; id: string };
  summary: string;
  details?: Record<string, OpsDetailValue>;
  dedupeKey?: string;
  adminPath?: string;
};

const sensitiveKeyPattern = /(?:email|phone|token|secret|password|authorization|cookie|signed|download|raw|stack|body)/i;
const safeKeyPattern = /^[a-z][a-z0-9_.-]{0,63}$/i;
const safeEventPartPattern = /[^a-zA-Z0-9._:-]+/g;

export function isOpsEventType(value: unknown): value is OpsEventType {
  return typeof value === "string" && (opsEventTypes as readonly string[]).includes(value);
}

export function isOpsSeverity(value: unknown): value is OpsSeverity {
  return value === "P1" || value === "P2" || value === "P3";
}

export function isOpsSource(value: unknown): value is OpsSource {
  return value === "export" || value === "billing" || value === "runtime" || value === "admin" || value === "ops";
}

export function isOpsEntityKind(value: unknown): value is OpsEntityKind {
  return value === "export_job" || value === "payment" || value === "template" || value === "runtime";
}

export function createOpsEvent(input: CreateOpsEventInput): OpsEvent {
  if (!isOpsEventType(input.type)) throw new Error("invalid_ops_event_type");
  if (!isOpsSeverity(input.severity)) throw new Error("invalid_ops_event_severity");
  if (!isOpsSource(input.source)) throw new Error("invalid_ops_event_source");
  if (input.entity && !isOpsEntityKind(input.entity.kind)) throw new Error("invalid_ops_event_entity_kind");

  const eventId = normalizeRequired(input.eventId ?? crypto.randomUUID(), "eventId", 240);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("invalid_ops_event_time");

  const entity = input.entity
    ? {
        kind: input.entity.kind,
        id: normalizeRequired(input.entity.id, "entity.id", 160),
      }
    : undefined;
  const adminPath = normalizeAdminPath(input.adminPath);
  const summary = sanitizeText(input.summary, 240);
  if (!summary) throw new Error("invalid_ops_event_summary");

  return {
    eventId,
    type: input.type,
    severity: input.severity,
    source: input.source,
    occurredAt,
    ...(entity ? { entity } : {}),
    summary,
    details: sanitizeDetails(input.details ?? {}),
    dedupeKey: normalizeRequired(input.dedupeKey ?? eventId, "dedupeKey", 240),
    ...(adminPath ? { adminPath } : {}),
  };
}

export function deterministicOpsEventId(type: OpsEventType, ...parts: string[]) {
  return [type, ...parts].map((part) => normalizeRequired(part, "eventPart", 100)).join(":").slice(0, 240);
}

export function sanitizeDetails(details: Record<string, OpsDetailValue>) {
  const sanitized: Record<string, OpsDetailValue> = {};
  for (const [rawKey, value] of Object.entries(details)) {
    const key = rawKey.trim();
    if (!safeKeyPattern.test(key) || sensitiveKeyPattern.test(key)) continue;
    if (typeof value === "string") {
      sanitized[key] = sanitizeText(value, 160);
    } else if (typeof value === "number") {
      sanitized[key] = Number.isFinite(value) ? value : null;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function normalizeAdminPath(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!/^\/admin(?:\/|$)/.test(normalized)) return undefined;
  return sanitizeText(normalized, 300);
}

function normalizeRequired(value: string, field: string, maxLength: number) {
  const normalized = value.trim().replace(safeEventPartPattern, "_");
  if (!normalized) throw new Error(`invalid_ops_event_${field}`);
  return normalized.slice(0, maxLength);
}

function sanitizeText(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?82[-.\s]?)?01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[redacted-phone]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .trim()
    .slice(0, maxLength);
}
