import { getPreviousOpsDay } from "@/lib/ops/dailySummary";

const exportSweepUrl = "https://internal/api/internal/ops/export/sweep";
const telegramDrainUrl = "https://internal/api/internal/ops/telegram/drain";
const dailySummaryUrl = "https://internal/api/internal/ops/daily-summary";
const opsTokenHeader = "x-ops-notifications-token";

// Cloudflare Cron is UTC. 23:00 UTC is 08:00 KST on the following calendar day.
export const dailySummaryCron = "0 23 * * *";

export type ScheduledOpsController = {
  cron?: string;
  scheduledTime: number;
  noRetry(): void;
};

export type ScheduledOpsService = {
  fetch(request: Request): Promise<Response>;
};

export type ScheduledOpsEnvironment = {
  WORKER_SELF_REFERENCE?: ScheduledOpsService;
  OPS_NOTIFICATIONS_DRAIN_TOKEN?: string;
};

type ScheduledOperation = {
  event: "daily_summary" | "ga4_correction" | "telegram_drain" | "export_sweep";
  url: string;
};

export async function runScheduledOps(
  controller: ScheduledOpsController,
  env: ScheduledOpsEnvironment,
) {
  const token = env.OPS_NOTIFICATIONS_DRAIN_TOKEN?.trim();
  if (!token || !env.WORKER_SELF_REFERENCE) {
    controller.noRetry();
    console.error("[scheduled-ops] configuration_missing");
    return { status: "skipped" as const, reason: "configuration_missing" as const };
  }

  // The daily trigger overlaps the five-minute cron at 23:00 UTC. Keep its retry
  // scope to the summary itself; maintenance remains the five-minute cron's job.
  const operations: ScheduledOperation[] = controller.cron === dailySummaryCron
    ? [
      ...getGa4CorrectionUrls(controller.scheduledTime).map((url) => ({ event: "ga4_correction" as const, url })),
      { event: "daily_summary", url: getDailySummaryUrl(controller.scheduledTime) },
    ]
    : [
      { event: "telegram_drain", url: telegramDrainUrl },
      { event: "export_sweep", url: exportSweepUrl },
    ];

  const failures: string[] = [];
  for (const operation of operations) {
    try {
      const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(operation.url, {
        method: "POST",
        headers: { [opsTokenHeader]: token },
      }));
      const disabledTelegramDrain = await isDisabledTelegramDrain(operation, response);
      await response.body?.cancel();

      if (!response.ok && !disabledTelegramDrain) {
        failures.push(`${operation.event}_failed_http_${response.status}`);
      }
    } catch (error) {
      failures.push(
        error instanceof Error
          ? `${operation.event}_failed_${error.message}`
          : `${operation.event}_failed_unknown`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({
      event: "scheduled_ops_failed",
      cron: controller.cron ?? null,
      failures,
    }));
    throw new Error(failures.join(","));
  }

  console.log(JSON.stringify({
    event: "scheduled_ops_completed",
    cron: controller.cron ?? null,
    operations: operations.map(({ event }) => event),
  }));
  return { status: "completed" as const, operations: operations.map(({ event }) => event) };
}

function getDailySummaryUrl(scheduledTime: number) {
  const day = getPreviousOpsDay(new Date(scheduledTime));
  return `${dailySummaryUrl}?date=${encodeURIComponent(day)}&recover_dead_letter=0`;
}

function getGa4CorrectionUrls(scheduledTime: number) {
  // Retry pending summaries for one week after GA4's 48-hour freshness window.
  return Array.from({ length: 7 }, (_, index) => {
    const correctionDay = getPreviousOpsDay(new Date(scheduledTime - (2 + index) * 24 * 60 * 60 * 1000));
    return `${dailySummaryUrl}?date=${encodeURIComponent(correctionDay)}&mode=ga4_correction&recover_dead_letter=0`;
  });
}

async function isDisabledTelegramDrain(operation: ScheduledOperation, response: Response) {
  if (operation.event !== "telegram_drain" || response.status !== 503) return false;

  try {
    const body: unknown = await response.clone().json();
    return typeof body === "object" && body !== null && "reason" in body && body.reason === "disabled";
  } catch {
    return false;
  }
}
