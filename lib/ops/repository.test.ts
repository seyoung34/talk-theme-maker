import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpsEvent, type OpsEvent } from "@/lib/ops/events";
import { claimOpsNotificationBatch, enqueueOpsEvent, getOpsDailySummary, getOpsStatusSnapshot } from "@/lib/ops/repository";

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

  it("parses aggregate RPC counts returned as PostgreSQL bigint strings", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        signups: "2",
        payments_paid: "1",
        payments_paid_amount: "4900",
        payment_failures: "0",
        refunds_count: "0",
        refunds_amount: "0",
        refunds_review_required: "0",
        exports_succeeded: "3",
        exports_failed: "1",
        exports_pending: "1",
        new_inquiries: "1",
        open_inquiries: "1",
        p1_issues: "0",
        p2_issues: "1",
        dead_letter_notifications: "0",
      }],
      error: null,
    });

    await expect(getOpsDailySummary({
      startAt: "2026-09-01T15:00:00.000Z",
      endAt: "2026-09-02T15:00:00.000Z",
    })).resolves.toMatchObject({ signups: 2, paymentsPaidAmount: 4900, exportsFailed: 1 });
  });

  it("parses the current status snapshot without exposing payloads", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        pending_exports: 1,
        stale_exports: 0,
        pending_notifications: 2,
        retry_notifications: 1,
        dead_letter_notifications: 0,
        open_inquiries: 1,
        billing_holds: 0,
        last_p1_at: null,
      }],
      error: null,
    });

    await expect(getOpsStatusSnapshot()).resolves.toEqual({
      pendingExports: 1,
      staleExports: 0,
      pendingNotifications: 2,
      retryNotifications: 1,
      deadLetterNotifications: 0,
      openInquiries: 1,
      billingHolds: 0,
      lastP1At: null,
    });
  });
});
