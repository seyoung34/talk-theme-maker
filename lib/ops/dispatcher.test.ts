import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpsEvent } from "@/lib/ops/events";
import { tryPublishOpsEvent } from "@/lib/ops/dispatcher";

const mocks = vi.hoisted(() => ({
  claimOpsNotificationBatch: vi.fn(),
  enqueueOpsEvent: vi.fn(),
  isTelegramNotificationsEnabled: vi.fn(),
  readTelegramConfig: vi.fn(),
  requeueOpsNotification: vi.fn(),
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
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/ops/repository", () => ({
  claimOpsNotificationBatch: mocks.claimOpsNotificationBatch,
  enqueueOpsEvent: mocks.enqueueOpsEvent,
  markOpsNotificationDeadLetter: vi.fn(),
  markOpsNotificationRetry: vi.fn(),
  markOpsNotificationSent: vi.fn(),
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
  });

  it("requeues a dead-letter delivery before draining an idempotent duplicate", async () => {
    await expect(tryPublishOpsEvent(event)).resolves.toMatchObject({
      status: "duplicate",
      requeued: true,
      drainResult: { status: "drained", claimed: 0 },
    });
    expect(mocks.requeueOpsNotification).toHaveBeenCalledWith({ eventId: event.eventId });
  });
});
