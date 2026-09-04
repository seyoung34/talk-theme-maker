const exportSweepUrl = "https://internal/api/internal/ops/export/sweep";
const opsTokenHeader = "x-ops-notifications-token";

export type ExportSweepController = {
  cron?: string;
  noRetry(): void;
};

export type ExportSweepService = {
  fetch(request: Request): Promise<Response>;
};

export type ExportSweepEnvironment = {
  WORKER_SELF_REFERENCE?: ExportSweepService;
  OPS_NOTIFICATIONS_DRAIN_TOKEN?: string;
};

export async function runScheduledExportSweep(
  controller: ExportSweepController,
  env: ExportSweepEnvironment,
) {
  const token = env.OPS_NOTIFICATIONS_DRAIN_TOKEN?.trim();
  if (!token || !env.WORKER_SELF_REFERENCE) {
    controller.noRetry();
    console.error("[scheduled-export-sweep] configuration_missing");
    return { status: "skipped" as const, reason: "configuration_missing" as const };
  }

  const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(exportSweepUrl, {
    method: "POST",
    headers: { [opsTokenHeader]: token },
  }));
  await response.body?.cancel();

  if (!response.ok) {
    throw new Error(`export_sweep_failed_http_${response.status}`);
  }

  console.log(JSON.stringify({
    event: "export_sweep_completed",
    cron: controller.cron ?? null,
    status: response.status,
  }));
  return { status: "completed" as const, httpStatus: response.status };
}
