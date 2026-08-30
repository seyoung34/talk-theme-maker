import { createAdminClient } from "@/lib/supabase/server";
import {
  createOpsEvent,
  isOpsEntityKind,
  isOpsEventType,
  isOpsSeverity,
  isOpsSource,
  type OpsEvent,
  type OpsDetailValue,
} from "@/lib/ops/events";

export type ClaimedOpsNotification = {
  event: OpsEvent;
  attemptCount: number;
  leaseId: string;
};

export type OpsDeliveryStatus = "sent" | "retry" | "dead_letter";

export async function enqueueOpsEvent(event: OpsEvent): Promise<"inserted" | "duplicate"> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("enqueue_ops_event", {
    p_event_id: event.eventId,
    p_event_type: event.type,
    p_severity: event.severity,
    p_source: event.source,
    p_entity_kind: event.entity?.kind ?? null,
    p_entity_id: event.entity?.id ?? null,
    p_payload: {
      summary: event.summary,
      details: event.details,
      ...(event.adminPath ? { adminPath: event.adminPath } : {}),
    },
    p_dedupe_key: event.dedupeKey,
    p_occurred_at: event.occurredAt,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (result !== "inserted" && result !== "duplicate") throw new Error("invalid_ops_enqueue_result");
  return result;
}

export async function claimOpsNotificationBatch(input: { limit?: number; leaseSeconds?: number } = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_ops_notification_batch", {
    p_limit: input.limit ?? 10,
    p_lease_seconds: input.leaseSeconds ?? 60,
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row) => parseClaimedNotification(row));
}

export async function markOpsNotificationSent(input: {
  eventId: string;
  leaseId: string;
  providerMessageId: string | null;
}) {
  return updateOpsDelivery("mark_ops_notification_sent", {
    p_event_id: input.eventId,
    p_channel: "telegram",
    p_lease_id: input.leaseId,
    p_provider_message_id: input.providerMessageId,
  });
}

export async function markOpsNotificationRetry(input: {
  eventId: string;
  leaseId: string;
  errorCode: string;
  nextAttemptAt: string;
}) {
  return updateOpsDelivery("mark_ops_notification_retry", {
    p_event_id: input.eventId,
    p_channel: "telegram",
    p_lease_id: input.leaseId,
    p_error_code: input.errorCode,
    p_next_attempt_at: input.nextAttemptAt,
  });
}

export async function markOpsNotificationDeadLetter(input: {
  eventId: string;
  leaseId: string;
  errorCode: string;
}) {
  return updateOpsDelivery("mark_ops_notification_dead_letter", {
    p_event_id: input.eventId,
    p_channel: "telegram",
    p_lease_id: input.leaseId,
    p_error_code: input.errorCode,
  });
}

async function updateOpsDelivery(
  functionName: "mark_ops_notification_sent" | "mark_ops_notification_retry" | "mark_ops_notification_dead_letter",
  args: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(functionName, args);
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result === true;
}

function parseClaimedNotification(row: unknown): ClaimedOpsNotification {
  if (!isRecord(row)) throw new Error("invalid_ops_notification_row");
  const eventId = requireString(row.event_id, "event_id");
  const eventType = requireValue(row.event_type, isOpsEventType, "event_type");
  const severity = requireValue(row.severity, isOpsSeverity, "severity");
  const source = requireValue(row.source, isOpsSource, "source");
  const entityKind = row.entity_kind === null || row.entity_kind === undefined
    ? undefined
    : requireValue(row.entity_kind, isOpsEntityKind, "entity_kind");
  const entityId = row.entity_id === null || row.entity_id === undefined
    ? undefined
    : requireString(row.entity_id, "entity_id");
  const payload = parsePayload(row.payload);
  const event = createOpsEvent({
    eventId,
    type: eventType,
    severity,
    source,
    occurredAt: requireString(row.occurred_at, "occurred_at"),
    ...(entityKind && entityId ? { entity: { kind: entityKind, id: entityId } } : {}),
    summary: payload.summary,
    details: payload.details,
    dedupeKey: requireString(row.dedupe_key, "dedupe_key"),
    adminPath: payload.adminPath,
  });

  const attemptCount = row.attempt_count;
  if (typeof attemptCount !== "number" || !Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new Error("invalid_ops_notification_attempt_count");
  }
  const leaseId = requireString(row.lease_id, "lease_id");
  return { event, attemptCount, leaseId };
}

function parsePayload(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid_ops_notification_payload");
  const summary = requireString(value.summary, "payload.summary");
  const details = isRecord(value.details) ? parseDetails(value.details) : {};
  const adminPath = typeof value.adminPath === "string" && /^\/admin(?:\/|$)/.test(value.adminPath)
    ? value.adminPath
    : undefined;
  return { summary, details, adminPath };
}

function parseDetails(value: Record<string, unknown>) {
  const details: Record<string, OpsDetailValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
      details[key] = item;
    }
  }
  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid_ops_notification_${field}`);
  return value;
}

function requireValue<T>(value: unknown, predicate: (candidate: unknown) => candidate is T, field: string): T {
  if (!predicate(value)) throw new Error(`invalid_ops_notification_${field}`);
  return value;
}
