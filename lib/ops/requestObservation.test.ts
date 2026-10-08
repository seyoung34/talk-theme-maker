import { afterEach, describe, expect, it, vi } from "vitest";
import { createExportEnqueueFailureEvent, createExportFailureEvent, createExportRefundFailureEvent, createGrobleWebhookRejectedEvent } from "./eventFactories";
import { createCorrelationId, observationDetails, recordOperationFailure, safeTelemetry, safeErrorClass, setObservationStage, transientFailureIdentity, withObservationJob, withRequestObservation } from "./requestObservation";

const job = "11111111-1111-1111-1111-111111111111";
const request = (ray = "0123456789abcdef-LAX") => new Request("https://example.test/private?email=private@example.test", { headers: { "cf-ray": ray } });
const scope = <T>(run: () => Promise<T>, ray?: string) => withRequestObservation(request(ray), "/api/export/android", "export.enqueue", run);
afterEach(() => vi.restoreAllMocks());

describe("request observation privacy and isolation", () => {
  it("identifies standard constructors without trusting arbitrary names", () => {
    const error = new Error("secret"); error.name = "private_customer";
    expect(safeErrorClass(error)).toBeUndefined();
    expect(safeErrorClass({ name: "TypeError" })).toBeUndefined();
    const typed = new TypeError("private"); typed.name = "private_customer";
    expect(safeErrorClass(typed)).toBe("TypeError");
    expect(safeErrorClass(new DOMException("secret", "AbortError"))).toBe("AbortError");
  });
  it("accepts bounded rays and replaces untrusted values", () => {
    expect(createCorrelationId(request().headers)).toBe("0123456789abcdef-LAX");
    expect(createCorrelationId(request("private@example.test").headers)).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("isolates concurrent requests and restores the parent after a job scope", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = scope(async () => {
      setObservationStage("input_upload", "gcs");
      await gate;
      expect(observationDetails()).toMatchObject({ stage: "input_upload", correlationId: "0123456789abcdef-LAX" });
      await withObservationJob(job, async () => { setObservationStage("settlement", "database"); });
      expect(observationDetails().stage).toBe("input_upload");
    });
    await scope(async () => {
      setObservationStage("reservation", "database");
      expect(observationDetails().correlationId).toBe("fedcba9876543210-ICN");
      release();
    }, "fedcba9876543210-ICN");
    await first;
    expect(observationDetails()).toEqual({});
  });

  it("logs only safe fields and preserves the original stage before cleanup", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await scope(async () => {
      setObservationStage("input_upload", "gcs", job);
      const event = createExportEnqueueFailureEvent({ platform: "android", exportJobId: job, errorCode: "gcs_upload_failed" });
      setObservationStage("settlement", "database");
      expect(event.details).toMatchObject({ stage: "input_upload", dependency: "gcs", errorCode: "gcs_upload_failed" });
      recordOperationFailure("private_customer", 500);
    });
    const entry = log.mock.calls[0][0] as Record<string, unknown>;
    expect(entry).toMatchObject({ stage: "settlement", dependency: "database", errorCode: "settlement_failed", exportJobId: job, httpStatus: 500 });
    expect(entry.wallDurationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(entry)).not.toMatch(/private|email|example\.test/);
  });

  it("does not change operation results when logging or alert construction fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await scope(async () => {
      expect(safeTelemetry(() => { throw new Error("secret"); })).toBeUndefined();
    });
    expect(log.mock.calls[0][0]).toMatchObject({ event: "telemetry_failed" });
    log.mockImplementation(() => { throw new Error("broken logger"); });
    await expect(scope(async () => { recordOperationFailure(); return "ok"; })).resolves.toBe("ok");
    const failure = new Error("original");
    await expect(scope(async () => { throw failure; })).rejects.toBe(failure);
  });
});

describe("transient alert grouping", () => {
  it("keeps rejected payment identities distinct and permanently deduplicates retries", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(300_001);
    await withRequestObservation(request(), "/api/billing/groble/webhook", "billing.webhook", async () => {
      setObservationStage("validation", "groble");
      const reject = (eventId: string) => createGrobleWebhookRejectedEvent({ eventId, errorCode: "invalid_reference", eventType: "payment.completed", occurredAt: null });
      const first = reject("payment-a");
      expect(reject("payment-b").eventId).not.toBe(first.eventId);
      expect(reject("payment-a").eventId).toBe(first.eventId);
      now.mockReturnValue(900_000);
      expect(reject("payment-a").eventId).toBe(first.eventId);
      expect(reject("payment-a").dedupeKey).toBe(first.dedupeKey);
    });
  });
  it("groups five minutes across jobs but separates safe causes and windows", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(300_001);
    await scope(async () => {
      setObservationStage("jobs_enqueue", "cloud_run");
      const build = (errorCode: string, exportJobId = job) => createExportEnqueueFailureEvent({ platform: "android", exportJobId, errorCode });
      const first = build("job_run_failed");
      expect(build("job_run_failed", "22222222-2222-2222-2222-222222222222").eventId).toBe(first.eventId);
      expect(first.dedupeKey).toBe(first.eventId);
      expect(build("job_run_request_failed").eventId).not.toBe(first.eventId);
      now.mockReturnValue(600_000);
      expect(build("job_run_failed").eventId).not.toBe(first.eventId);
      expect(first.eventId.length).toBeLessThan(240);
    });
  });

  it("keeps terminal and financial event identities permanent and per job", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1);
    await scope(async () => {
      const terminal = () => createExportFailureEvent({ platform: "android", exportJobId: job, errorCode: "build_failed" });
      const refund = (exportJobId = job) => createExportRefundFailureEvent({ platform: "android", exportJobId, errorCode: "settlement_failed" });
      const first = terminal(); const initialRefund = refund();
      now.mockReturnValue(900_000);
      expect(terminal().eventId).toBe(first.eventId);
      expect(refund().eventId).toBe(initialRefund.eventId);
      expect(refund("other-job").eventId).not.toBe(initialRefund.eventId);
      expect(initialRefund.severity).toBe("P1");
    });
  });

  it("rejects labels that could overflow or inject group identity", () => {
    expect(transientFailureIdentity({ operation: "a".repeat(41), stage: "validation", dependency: "database", errorCode: "unknown_error" })).toBeUndefined();
  });
});
