import { describe, expect, it, vi } from "vitest";
import { runScheduledExportSweep } from "@/lib/ops/exportSweepScheduler";

function createController() {
  return { cron: "*/5 * * * *", noRetry: vi.fn() };
}

describe("scheduled export sweep", () => {
  it("does not retry when the scheduler is not configured", async () => {
    const controller = createController();

    await expect(runScheduledExportSweep(controller, {})).resolves.toEqual({
      status: "skipped",
      reason: "configuration_missing",
    });
    expect(controller.noRetry).toHaveBeenCalledOnce();
  });

  it("calls the authenticated internal sweep route", async () => {
    const controller = createController();
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://internal/api/internal/ops/export/sweep");
      expect(request.headers.get("x-ops-notifications-token")).toBe("scheduler-token");
      return new Response(null, { status: 200 });
    });

    await expect(runScheduledExportSweep(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: " scheduler-token ",
      WORKER_SELF_REFERENCE: { fetch },
    })).resolves.toEqual({ status: "completed", httpStatus: 200 });
    expect(controller.noRetry).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("leaves retryable sweep failures uncaught for Cloudflare to retry", async () => {
    const controller = createController();
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(runScheduledExportSweep(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: "scheduler-token",
      WORKER_SELF_REFERENCE: { fetch },
    })).rejects.toThrow("export_sweep_failed_http_503");
    expect(controller.noRetry).not.toHaveBeenCalled();
  });
});
