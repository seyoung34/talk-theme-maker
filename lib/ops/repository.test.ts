import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpsEvent, type OpsEvent } from "@/lib/ops/events";
import { claimOpsNotificationBatch, enqueueOpsEvent } from "@/lib/ops/repository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

describe("ops repository contract guards", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: "inserted", error: null });
  });

  it("rejects an unsupported event type before calling Supabase", async () => {
    const event = {
      ...createOpsEvent({
        eventId: "event-1",
        type: "runtime.health_failed",
        severity: "P1",
        source: "runtime",
        summary: "Health check failed",
      }),
      type: "runtime.unknown",
    } as unknown as OpsEvent;

    await expect(enqueueOpsEvent(event)).rejects.toThrow("invalid_ops_event_type");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unsupported entity kind before calling Supabase", async () => {
    const event = {
      ...createOpsEvent({
        eventId: "event-2",
        type: "runtime.health_failed",
        severity: "P1",
        source: "runtime",
        summary: "Health check failed",
      }),
      entity: { kind: "account", id: "account-1" },
    } as unknown as OpsEvent;

    await expect(enqueueOpsEvent(event)).rejects.toThrow("invalid_ops_event_entity_kind");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses a lease longer than the maximum external drain batch", async () => {
    await enqueueOpsEvent(createOpsEvent({
      eventId: "event-3",
      type: "runtime.health_failed",
      severity: "P1",
      source: "runtime",
      summary: "Health check failed",
    }));
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    await claimOpsNotificationBatch({ limit: 20 });

    expect(mocks.rpc).toHaveBeenLastCalledWith("claim_ops_notification_batch", {
      p_limit: 20,
      p_lease_seconds: 180,
    });
  });
});
