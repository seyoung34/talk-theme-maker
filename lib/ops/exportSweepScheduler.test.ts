import { describe, expect, it, vi } from "vitest";
import { dailySummaryCron, runScheduledOps } from "@/lib/ops/exportSweepScheduler";

function createController() {
  return { cron: "*/5 * * * *", scheduledTime: Date.parse("2026-09-01T23:00:00.000Z"), noRetry: vi.fn() };
}

describe("scheduled ops", () => {
  it("does not retry when the scheduler is not configured", async () => {
    const controller = createController();

    await expect(runScheduledOps(controller, {})).resolves.toEqual({
      status: "skipped",
      reason: "configuration_missing",
    });
    expect(controller.noRetry).toHaveBeenCalledOnce();
  });

  it("drains Telegram deliveries and sweeps exports every five minutes", async () => {
    const controller = createController();
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.headers.get("x-ops-notifications-token")).toBe("scheduler-token");
      return new Response(null, { status: 200 });
    });

    await expect(runScheduledOps(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: " scheduler-token ",
      WORKER_SELF_REFERENCE: { fetch },
    })).resolves.toEqual({
      status: "completed",
      operations: ["telegram_drain", "export_sweep"],
    });
    expect(controller.noRetry).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([request]) => request.url)).toEqual([
      "https://internal/api/internal/ops/telegram/drain",
      "https://internal/api/internal/ops/export/sweep",
    ]);
  });

  it("publishes the delayed GA4 correction and daily summary at 08:00 KST", async () => {
    const controller = {
      cron: dailySummaryCron,
      scheduledTime: Date.parse("2026-09-01T23:00:00.000Z"),
      noRetry: vi.fn(),
    };
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );

    await expect(runScheduledOps(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: "scheduler-token",
      WORKER_SELF_REFERENCE: { fetch },
    })).resolves.toEqual({
      status: "completed",
      operations: ["ga4_correction", "daily_summary"],
    });
    expect(fetch.mock.calls.map(([request]) => request.url)).toEqual([
      "https://internal/api/internal/ops/daily-summary?date=2026-08-30&mode=ga4_correction&recover_dead_letter=0",
      "https://internal/api/internal/ops/daily-summary?date=2026-09-01&recover_dead_letter=0",
    ]);
  });

  it("runs export recovery when Telegram delivery fails before retrying the schedule", async () => {
    const controller = createController();
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
      const status = request.url === "https://internal/api/internal/ops/telegram/drain" ? 503 : 200;
      return new Response(null, { status });
    });

    await expect(runScheduledOps(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: "scheduler-token",
      WORKER_SELF_REFERENCE: { fetch },
    })).rejects.toThrow("telegram_drain_failed_http_503");
    expect(controller.noRetry).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([request]) => request.url)).toEqual([
      "https://internal/api/internal/ops/telegram/drain",
      "https://internal/api/internal/ops/export/sweep",
    ]);
  });

  it("treats an intentionally disabled Telegram drain as maintenance no-op", async () => {
    const controller = createController();
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
      if (request.url === "https://internal/api/internal/ops/telegram/drain") {
        return Response.json({ reason: "disabled" }, { status: 503 });
      }
      return new Response(null, { status: 200 });
    });

    await expect(runScheduledOps(controller, {
      OPS_NOTIFICATIONS_DRAIN_TOKEN: "scheduler-token",
      WORKER_SELF_REFERENCE: { fetch },
    })).resolves.toEqual({
      status: "completed",
      operations: ["telegram_drain", "export_sweep"],
    });
    expect(fetch.mock.calls.map(([request]) => request.url)).toEqual([
      "https://internal/api/internal/ops/telegram/drain",
      "https://internal/api/internal/ops/export/sweep",
    ]);
  });
});
