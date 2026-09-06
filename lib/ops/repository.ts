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
export type OpsTelegramCommandUpdateClaim = "claimed" | "in_progress" | "duplicate";

export type OpsDailySummaryCounts = {
  signups: number;
  paymentsPaid: number;
  paymentsPaidAmount: number;
  paymentFailures: number;
  refundsCount: number;
  refundsAmount: number;
  refundsReviewRequired: number;
  exportsSucceeded: number;
  exportsFailed: number;
  exportsPending: number;
  newInquiries: number;
  openInquiries: number;
  p1Issues: number;
  p2Issues: number;
  deadLetterNotifications: number;
};

export type OpsStatusSnapshot = {
  pendingExports: number;
  staleExports: number;
  pendingNotifications: number;
  retryNotifications: number;
  deadLetterNotifications: number;
  openInquiries: number;
  billingHolds: number;
  lastP1At: string | null;
};

export type OpsIssue = {
  eventId: string;
  eventType: OpsEvent["type"];
  severity: "P1" | "P2";
  occurredAt: string;
  entityKind?: NonNullable<OpsEvent["entity"]>["kind"];
  entityId?: string;
};

export type OpsInquiryIssue = {
  id: string;
  status: "open" | "answered";
  createdAt: string;
};

const telegramDeliveryLeaseSeconds = 180;

export async function enqueueOpsEvent(event: OpsEvent): Promise<"inserted" | "duplicate"> {
  assertOpsEventEnums(event);
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
    p_lease_seconds: input.leaseSeconds ?? telegramDeliveryLeaseSeconds,
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

export async function requeueOpsNotification(input: { eventId: string; channel?: "telegram" }) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("requeue_ops_notification", {
    p_event_id: input.eventId,
    p_channel: input.channel ?? "telegram",
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result === true;
}

/** Claim one Telegram update before executing its command or sending a reply. */
export async function claimOpsTelegramCommandUpdate(updateId: number): Promise<OpsTelegramCommandUpdateClaim> {
  assertTelegramUpdateId(updateId);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_ops_telegram_command_update", { p_update_id: updateId });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (result !== "claimed" && result !== "in_progress" && result !== "duplicate") {
    throw new Error("invalid_ops_telegram_command_update_claim");
  }
  return result;
}

export async function markOpsTelegramCommandUpdateSent(input: { updateId: number; providerMessageId: string | null }) {
  assertTelegramUpdateId(input.updateId);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mark_ops_telegram_command_update_sent", {
    p_update_id: input.updateId,
    p_provider_message_id: input.providerMessageId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) === true;
}

/** Release only a reply that was definitely not sent, so Telegram may retry it. */
export async function releaseOpsTelegramCommandUpdate(updateId: number) {
  assertTelegramUpdateId(updateId);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("release_ops_telegram_command_update", { p_update_id: updateId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) === true;
}

export async function acknowledgeOpsTelegramCommandUpdate(input: { updateId: number; reason: string }) {
  assertTelegramUpdateId(input.updateId);
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(input.reason)) throw new Error("invalid_ops_telegram_command_update_reason");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("acknowledge_ops_telegram_command_update", {
    p_update_id: input.updateId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) === true;
}

export async function getOpsDailySummary(input: { startAt: string; endAt: string }): Promise<OpsDailySummaryCounts> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_ops_daily_summary", {
    p_start: input.startAt,
    p_end: input.endAt,
  });
  if (error) throw error;
  return parseOpsDailySummary(getRpcRow(data, "ops_daily_summary"));
}

export async function getOpsStatusSnapshot(): Promise<OpsStatusSnapshot> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_ops_status_snapshot", {});
  if (error) throw error;
  return parseOpsStatusSnapshot(getRpcRow(data, "ops_status_snapshot"));
}

export async function listRecentOpsIssues(input: { limit?: number } = {}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 8), 1), 20);
  const admin = createAdminClient();
  const [eventsResult, inquiriesResult] = await Promise.all([
    admin
      .from("ops_events")
      .select("event_id,event_type,severity,occurred_at,entity_kind,entity_id")
      .in("severity", ["P1", "P2"])
      .order("occurred_at", { ascending: false })
      .limit(limit),
    admin
      .from("inquiries")
      .select("id,status,created_at")
      .in("status", ["open", "answered"])
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (inquiriesResult.error) throw inquiriesResult.error;

  return {
    events: (eventsResult.data as unknown[] | null ?? []).map(parseOpsIssue),
    inquiries: (inquiriesResult.data as unknown[] | null ?? []).map(parseOpsInquiryIssue),
  };
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

function parseOpsDailySummary(row: unknown): OpsDailySummaryCounts {
  if (!isRecord(row)) throw new Error("invalid_ops_daily_summary_row");
  return {
    signups: parseCount(row.signups, "signups"),
    paymentsPaid: parseCount(row.payments_paid, "payments_paid"),
    paymentsPaidAmount: parseCount(row.payments_paid_amount, "payments_paid_amount"),
    paymentFailures: parseCount(row.payment_failures, "payment_failures"),
    refundsCount: parseCount(row.refunds_count, "refunds_count"),
    refundsAmount: parseCount(row.refunds_amount, "refunds_amount"),
    refundsReviewRequired: parseCount(row.refunds_review_required, "refunds_review_required"),
    exportsSucceeded: parseCount(row.exports_succeeded, "exports_succeeded"),
    exportsFailed: parseCount(row.exports_failed, "exports_failed"),
    exportsPending: parseCount(row.exports_pending, "exports_pending"),
    newInquiries: parseCount(row.new_inquiries, "new_inquiries"),
    openInquiries: parseCount(row.open_inquiries, "open_inquiries"),
    p1Issues: parseCount(row.p1_issues, "p1_issues"),
    p2Issues: parseCount(row.p2_issues, "p2_issues"),
    deadLetterNotifications: parseCount(row.dead_letter_notifications, "dead_letter_notifications"),
  };
}

function parseOpsStatusSnapshot(row: unknown): OpsStatusSnapshot {
  if (!isRecord(row)) throw new Error("invalid_ops_status_snapshot_row");
  return {
    pendingExports: parseCount(row.pending_exports, "pending_exports"),
    staleExports: parseCount(row.stale_exports, "stale_exports"),
    pendingNotifications: parseCount(row.pending_notifications, "pending_notifications"),
    retryNotifications: parseCount(row.retry_notifications, "retry_notifications"),
    deadLetterNotifications: parseCount(row.dead_letter_notifications, "dead_letter_notifications"),
    openInquiries: parseCount(row.open_inquiries, "open_inquiries"),
    billingHolds: parseCount(row.billing_holds, "billing_holds"),
    lastP1At: parseNullableTimestamp(row.last_p1_at, "last_p1_at"),
  };
}

function parseOpsIssue(row: unknown): OpsIssue {
  if (!isRecord(row)) throw new Error("invalid_ops_issue_row");
  const eventId = requireString(row.event_id, "event_id");
  const eventType = requireValue(row.event_type, isOpsEventType, "event_type");
  const severity = row.severity === "P1" || row.severity === "P2" ? row.severity : null;
  if (!severity) throw new Error("invalid_ops_issue_severity");
  const entityKind = row.entity_kind === null || row.entity_kind === undefined
    ? undefined
    : requireValue(row.entity_kind, isOpsEntityKind, "entity_kind");
  const entityId = row.entity_id === null || row.entity_id === undefined
    ? undefined
    : requireString(row.entity_id, "entity_id");
  return {
    eventId,
    eventType,
    severity,
    occurredAt: requireTimestamp(row.occurred_at, "occurred_at"),
    ...(entityKind ? { entityKind } : {}),
    ...(entityId ? { entityId } : {}),
  };
}

function parseOpsInquiryIssue(row: unknown): OpsInquiryIssue {
  if (!isRecord(row)) throw new Error("invalid_ops_inquiry_issue_row");
  const status = row.status === "open" || row.status === "answered" ? row.status : null;
  if (!status) throw new Error("invalid_ops_inquiry_issue_status");
  return {
    id: requireString(row.id, "inquiry_id"),
    status,
    createdAt: requireTimestamp(row.created_at, "inquiry_created_at"),
  };
}

function getRpcRow(value: unknown, name: string) {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`invalid_${name}_result`);
    return value[0];
  }
  return value;
}

function parseCount(value: unknown, field: string) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid_ops_${field}`);
  return parsed;
}

function assertTelegramUpdateId(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid_ops_telegram_update_id");
}

function requireTimestamp(value: unknown, field: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid_ops_${field}`);
  }
  return value;
}

function parseNullableTimestamp(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  return requireTimestamp(value, field);
}

function assertOpsEventEnums(event: OpsEvent) {
  if (!isOpsEventType(event.type)) throw new Error("invalid_ops_event_type");
  if (!isOpsSeverity(event.severity)) throw new Error("invalid_ops_event_severity");
  if (!isOpsSource(event.source)) throw new Error("invalid_ops_event_source");
  if (event.entity && !isOpsEntityKind(event.entity.kind)) throw new Error("invalid_ops_event_entity_kind");
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
