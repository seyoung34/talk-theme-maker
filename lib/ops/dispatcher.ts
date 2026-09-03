import { getCloudflareContext } from "@opennextjs/cloudflare";
import { formatOpsEventForTelegram } from "@/lib/ops/formatters";
import { isTelegramNotificationsEnabled, readTelegramConfig, sendTelegramMessage, TelegramError } from "@/lib/ops/telegram";
import {
  claimOpsNotificationBatch,
  enqueueOpsEvent,
  markOpsNotificationDeadLetter,
  markOpsNotificationRetry,
  markOpsNotificationSent,
  requeueOpsNotification,
} from "@/lib/ops/repository";
import type { OpsEvent } from "@/lib/ops/events";

const maxDeliveryAttempts = 5;
const maxBackoffMs = 15 * 60 * 1000;

export type TelegramDrainResult = {
  status: "disabled" | "drained";
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
};

export async function tryPublishOpsEvent(event: OpsEvent) {
  if (!isTelegramNotificationsEnabled()) return { status: "disabled" as const };

  try {
    const enqueueResult = await enqueueOpsEvent(event);
    if (enqueueResult === "duplicate") {
      const requeued = await requeueOpsNotification({ eventId: event.eventId });
      const drainResult = await drainTelegramNotifications({ limit: 1 });
      return { status: "duplicate" as const, requeued, drainResult };
    }
    const drainResult = await drainTelegramNotifications({ limit: 1 });
    return { status: enqueueResult, drainResult };
  } catch (error) {
    console.error("[ops-notification] publish_failed", {
      eventId: event.eventId,
      eventType: event.type,
      errorCode: getErrorCode(error),
    });
    return { status: "failed" as const, errorCode: getErrorCode(error) };
  }
}

/**
 * Operational alerts must not delay the user-facing export or webhook response. Cloudflare's
 * waitUntil keeps the outbox write and best-effort immediate delivery alive after the response;
 * local Next.js runs simply leave the promise running for tests and development.
 */
export function scheduleOpsEvent(event: OpsEvent) {
  const task = tryPublishOpsEvent(event);
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    void task;
  }
}

export async function drainTelegramNotifications(options: { limit?: number } = {}): Promise<TelegramDrainResult> {
  const config = readTelegramConfig();
  if (!config) return { status: "disabled", claimed: 0, sent: 0, retried: 0, deadLettered: 0 };

  const claimed = await claimOpsNotificationBatch({ limit: options.limit ?? 10 });
  let sent = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const delivery of claimed) {
    try {
      const message = formatOpsEventForTelegram(delivery.event);
      const result = await sendTelegramMessage(config, message);
      const marked = await markOpsNotificationSent({
        eventId: delivery.event.eventId,
        leaseId: delivery.leaseId,
        providerMessageId: result.providerMessageId,
      });
      if (marked) sent += 1;
      else logLeaseLost(delivery.event, "sent");
    } catch (error) {
      const telegramError = error instanceof TelegramError
        ? error
        : new TelegramError("telegram_network_error", "Telegram 알림 처리에 실패했습니다.", true);
      const shouldDeadLetter = !telegramError.retryable || delivery.attemptCount >= maxDeliveryAttempts;
      if (shouldDeadLetter) {
        const marked = await markOpsNotificationDeadLetter({
          eventId: delivery.event.eventId,
          leaseId: delivery.leaseId,
          errorCode: telegramError.code,
        });
        if (marked) deadLettered += 1;
        else logLeaseLost(delivery.event, "dead_letter");
      } else {
        const marked = await markOpsNotificationRetry({
          eventId: delivery.event.eventId,
          leaseId: delivery.leaseId,
          errorCode: telegramError.code,
          nextAttemptAt: new Date(Date.now() + getBackoffMs(delivery.attemptCount, telegramError.retryAfterSeconds)).toISOString(),
        });
        if (marked) retried += 1;
        else logLeaseLost(delivery.event, "retry");
      }
      console.error("[ops-notification] telegram_delivery_failed", {
        eventId: delivery.event.eventId,
        eventType: delivery.event.type,
        attemptCount: delivery.attemptCount,
        errorCode: telegramError.code,
        retryable: telegramError.retryable,
      });
    }
  }

  return { status: "drained", claimed: claimed.length, sent, retried, deadLettered };
}

function getBackoffMs(attemptCount: number, retryAfterSeconds?: number) {
  const exponentialMs = Math.min(maxBackoffMs, 1_000 * 2 ** Math.max(0, attemptCount - 1));
  const providerMs = typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds)
    ? Math.max(0, retryAfterSeconds * 1_000)
    : 0;
  return Math.min(maxBackoffMs, Math.max(exponentialMs, providerMs));
}

function getErrorCode(error: unknown) {
  if (error instanceof TelegramError) return error.code;
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "unknown_error";
}

function logLeaseLost(event: OpsEvent, action: string) {
  console.warn("[ops-notification] delivery_lease_lost", {
    eventId: event.eventId,
    eventType: event.type,
    action,
  });
}
