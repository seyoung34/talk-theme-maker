import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpsEvent, type OpsEvent } from "@/lib/ops/events";
import { tryPublishOpsEvent } from "@/lib/ops/dispatcher";
import { createExportEnqueueFailureEvent } from "@/lib/ops/eventFactories";
import { setObservationStage, withRequestObservation } from "@/lib/ops/requestObservation";

const mocks = vi.hoisted(() => ({
  claimOpsNotificationBatch: vi.fn(),
  enqueueOpsEvent: vi.fn(),
  isTelegramNotificationsEnabled: vi.fn(),
  readTelegramConfig: vi.fn(),
  requeueOpsNotification: vi.fn(),
  sendTelegramMessage: vi.fn(),
  markOpsNotificationSent: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/ops/formatters", () => ({
  formatOpsEventForTelegram: vi.fn(),
}));

vi.mock("@/lib/ops/telegram", () => ({
  TelegramError: class TelegramError extends Error {},
  isTelegramNotificationsEnabled: mocks.isTelegramNotificationsEnabled,
  readTelegramConfig: mocks.readTelegramConfig,
  sendTelegramMessage: mocks.sendTelegramMessage,
}));

vi.mock("@/lib/ops/repository", () => ({
  claimOpsNotificationBatch: mocks.claimOpsNotificationBatch,
  enqueueOpsEvent: mocks.enqueueOpsEvent,
  markOpsNotificationDeadLetter: vi.fn(),
  markOpsNotificationRetry: vi.fn(),
  markOpsNotificationSent: mocks.markOpsNotificationSent,
  requeueOpsNotification: mocks.requeueOpsNotification,
}));

const event = createOpsEvent({
  eventId: "runtime.health_failed:test",
  type: "runtime.health_failed",
  severity: "P1",
  source: "runtime",
  summary: "Health check failed",
});

describe("operations notification dispatcher", () => {
  beforeEach(() => {
    mocks.isTelegramNotificationsEnabled.mockReset().mockReturnValue(true);
    mocks.readTelegramConfig.mockReset().mockReturnValue({ botToken: "token", chatId: "chat" });
    mocks.enqueueOpsEvent.mockReset().mockResolvedValue("duplicate");
    mocks.requeueOpsNotification.mockReset().mockResolvedValue(true);
    mocks.claimOpsNotificationBatch.mockReset().mockResolvedValue([]);
    mocks.sendTelegramMessage.mockReset().mockResolvedValue({ providerMessageId: "message-1" });
    mocks.markOpsNotificationSent.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("requeues a dead-letter delivery before draining an idempotent duplicate", async () => {
    await expect(tryPublishOpsEvent(event, { recoverDeadLetter: true })).resolves.toMatchObject({
      status: "duplicate",
      requeued: true,
      drainResult: { status: "drained", claimed: 0 },
    });
    expect(mocks.requeueOpsNotification).toHaveBeenCalledWith({ eventId: event.eventId });
  });

  it("does not resurrect a dead-letter delivery for a normal duplicate publish", async () => {
    await expect(tryPublishOpsEvent(event)).resolves.toMatchObject({
      status: "duplicate",
      requeued: false,
      drainResult: { status: "drained", claimed: 0 },
    });
    expect(mocks.requeueOpsNotification).not.toHaveBeenCalled();
  });

  it("delivers only the first five-minute group event for failures from two jobs", async () => {
    vi.spyOn(Date, "now").mockReturnValue(300_001);
    const seen = new Set<string>();
    const queued: OpsEvent[] = [];
    mocks.enqueueOpsEvent.mockImplementation(async (input: OpsEvent) => {
      if (seen.has(input.eventId)) return "duplicate";
      seen.add(input.eventId);
      queued.push(input);
      return "inserted";
    });
    mocks.claimOpsNotificationBatch.mockImplementation(async () => {
      const next = queued.shift();
      return next ? [{ event: next, leaseId: "lease-1", attemptCount: 1 }] : [];
    });
    await withRequestObservation(new Request("https://site.test"), "/api/export/android", "export.enqueue", async () => {
      setObservationStage("input_upload", "gcs");
      for (const exportJobId of ["job-a", "job-b"]) {
        await tryPublishOpsEvent(createExportEnqueueFailureEvent({ platform: "android", exportJobId, errorCode: "gcs_upload_failed" }));
      }
    });
    expect(seen.size).toBe(1);
    expect(mocks.enqueueOpsEvent).toHaveBeenCalledTimes(2);
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mocks.markOpsNotificationSent).toHaveBeenCalledTimes(1);
    expect(mocks.requeueOpsNotification).not.toHaveBeenCalled();
  });
});
