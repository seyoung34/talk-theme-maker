import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverStalePendingExportBeforeReservation, resolveExportStatus } from "@/lib/theme/export/asyncExportStatus";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  completeExportJob: vi.fn(),
  failExportJob: vi.fn(),
  failExportJobIfPending: vi.fn(),
  cancelExportJob: vi.fn(),
  claimExportRecovery: vi.fn(),
  updateExportJobEnqueueState: vi.fn(),
  getBuilderAccessToken: vi.fn(),
  readBuilderConfig: vi.fn(),
  findBuilderExecution: vi.fn(),
  inspectBuilderInput: vi.fn(),
  runBuilderJob: vi.fn(),
  scheduleOpsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/billing/credits", () => ({
  completeExportJob: mocks.completeExportJob,
  failExportJobIfPending: mocks.failExportJobIfPending,
  cancelExportJob: mocks.cancelExportJob,
  claimExportRecovery: mocks.claimExportRecovery,
  updateExportJobEnqueueState: mocks.updateExportJobEnqueueState,
}));
vi.mock("@/lib/theme/export/buildJobClient", () => ({
  getBuilderAccessToken: mocks.getBuilderAccessToken,
  readBuilderConfig: mocks.readBuilderConfig,
  findBuilderExecution: mocks.findBuilderExecution,
  inspectBuilderInput: mocks.inspectBuilderInput,
  runBuilderJob: mocks.runBuilderJob,
}));
vi.mock("@/lib/ops/dispatcher", () => ({ scheduleOpsEvent: mocks.scheduleOpsEvent }));

describe("resolveExportStatus watchdog transition and enqueue recovery", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: mocks.maybeSingle };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.readBuilderConfig.mockReturnValue({
      projectId: "project",
      inputBucket: "input-bucket",
      jobRegion: "asia-northeast3",
      jobName: "android-builder",
      outputBucket: "output-bucket",
      builderServiceAccount: "builder@example.iam.gserviceaccount.com",
    });
    mocks.getBuilderAccessToken.mockResolvedValue("builder-token");
    vi.stubEnv("ANDROID_EXPORT_WATCHDOG_MS", "1");
    vi.stubEnv("IOS_EXPORT_WATCHDOG_MS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "job-1",
      user_id: "user-1",
      platform: "android",
      status: "pending",
      stage: "building",
      file_name: null,
      error: null,
      error_code: null,
      created_at: new Date(Date.now() - 10_000).toISOString(),
      enqueue_state: "running",
      enqueue_attempt: 0,
      builder_operation_name: null,
      builder_execution_name: null,
      input_completed_at: null,
      triggered_at: null,
      builder_started_at: null,
      last_heartbeat_at: null,
      recovery_reason: null,
      cancel_requested_at: null,
      ...overrides,
    };
  }

  it("shows a concurrently completed job without sending a watchdog alert", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow(), error: null })
      .mockResolvedValueOnce({
        data: { ...pendingRow(), status: "succeeded", file_name: "theme.apk" },
        error: null,
      });
    mocks.failExportJobIfPending.mockResolvedValue({ transitioned: false, status: "succeeded", balance: 0 });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/storage/v1/")) return new Response(null, { status: 404 });
      return new Response(JSON.stringify({ signedBlob: btoa("signature") }), { status: 200 });
    }));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result.kind).toBe("completed");
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("returns a concurrently cancelled job as failed instead of pending", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow(), error: null })
      .mockResolvedValueOnce({
        data: pendingRow({
          status: "failed",
          stage: "failed",
          error: "내보내기 작업이 취소되었습니다.",
          error_code: "build_cancelled",
        }),
        error: null,
      });
    mocks.completeExportJob.mockRejectedValue(new Error("export_job_not_pending"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      export_job_id: "job-1",
      output_path: "job-1/theme.apk",
      fileName: "theme.apk",
      bytes: 123,
    }), { status: 200 })));

    await expect(resolveExportStatus("user-1", "job-1", "android")).resolves.toEqual({
      kind: "failed",
      error: "내보내기 작업이 취소되었습니다.",
      reason: "build_cancelled",
    });
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("returns the persisted cancellation when it wins a failed-result settlement race", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow(), error: null })
      .mockResolvedValueOnce({
        data: pendingRow({
          status: "failed",
          stage: "failed",
          error: "내보내기 작업이 취소되었습니다.",
          error_code: "build_cancelled",
        }),
        error: null,
      });
    mocks.failExportJobIfPending.mockResolvedValue({ transitioned: false, status: "failed", balance: 1 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "failed",
      export_job_id: "job-1",
      errorCode: "android_build_failed",
    }), { status: 200 })));

    await expect(resolveExportStatus("user-1", "job-1", "android")).resolves.toEqual({
      kind: "failed",
      error: "내보내기 작업이 취소되었습니다.",
      reason: "build_cancelled",
    });
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("sends the watchdog alert only when this call wins the failure transition", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow(), error: null });
    mocks.failExportJobIfPending.mockResolvedValue({ transitioned: true, status: "failed", balance: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toMatchObject({ kind: "failed", reason: "build_watchdog_timeout" });
    expect(mocks.scheduleOpsEvent).toHaveBeenCalledOnce();
    expect(mocks.scheduleOpsEvent.mock.calls[0][0]).toMatchObject({ type: "export.watchdog_timeout" });
  });

  it("keeps the GCS timeout active until the result body finishes", async () => {
    vi.useFakeTimers();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode("{"));
        },
      });
      init?.signal?.addEventListener("abort", () => {
        streamController?.error(new DOMException("The operation was aborted.", "AbortError"));
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
    }));
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow(), error: null });

    const request = resolveExportStatus("user-1", "job-1", "android");
    const rejection = expect(request).rejects.toThrow("gcs_result_read_timeout");
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
  });

  it("uses the one recovery retry only after the input is complete and no execution exists", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow({
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      enqueue_state: "input_ready",
    }), error: null });
    mocks.findBuilderExecution.mockResolvedValue(null);
    mocks.inspectBuilderInput.mockResolvedValue({ complete: true, expectedObjectNames: [], actualObjectNames: [], missingObjectNames: [] });
    mocks.claimExportRecovery.mockResolvedValue({ claimed: true, status: "pending", enqueueState: "triggering", enqueueAttempt: 1 });
    mocks.runBuilderJob.mockResolvedValue({ operationName: "operations/recovered" });
    mocks.updateExportJobEnqueueState.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toEqual({ kind: "pending", stage: "queued" });
    expect(mocks.claimExportRecovery).toHaveBeenCalledWith({ userId: "user-1", exportJobId: "job-1", expectedAttempt: 0 });
    expect(mocks.runBuilderJob).toHaveBeenCalledWith(expect.anything(), "builder-token", expect.objectContaining({
      exportJobId: "job-1",
      attempt: 1,
    }));
  });

  it("starts recovery at the ten-minute reservation cutoff without failing an active build", async () => {
    vi.stubEnv("ANDROID_EXPORT_WATCHDOG_MS", "1500000");
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow({
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      enqueue_state: "input_ready",
    }), error: null });
    mocks.findBuilderExecution.mockResolvedValue(null);
    mocks.inspectBuilderInput.mockResolvedValue({ complete: true, expectedObjectNames: [], actualObjectNames: [], missingObjectNames: [] });
    mocks.claimExportRecovery.mockResolvedValue({ claimed: true, status: "pending", enqueueState: "triggering", enqueueAttempt: 1 });
    mocks.runBuilderJob.mockResolvedValue({ operationName: "operations/recovered-at-reservation-cutoff" });
    mocks.updateExportJobEnqueueState.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toEqual({ kind: "pending", stage: "queued" });
    expect(mocks.runBuilderJob).toHaveBeenCalledOnce();
    expect(mocks.failExportJobIfPending).not.toHaveBeenCalled();
  });

  it("recovers a stale pending export before a new reservation is attempted", async () => {
    const createdAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: "job-1", platform: "android", created_at: createdAt }, error: null })
      .mockResolvedValueOnce({ data: pendingRow({ created_at: createdAt, enqueue_state: "input_ready" }), error: null });
    mocks.findBuilderExecution.mockResolvedValue(null);
    mocks.inspectBuilderInput.mockResolvedValue({ complete: true, expectedObjectNames: [], actualObjectNames: [], missingObjectNames: [] });
    mocks.claimExportRecovery.mockResolvedValue({ claimed: true, status: "pending", enqueueState: "triggering", enqueueAttempt: 1 });
    mocks.runBuilderJob.mockResolvedValue({ operationName: "operations/recovered-before-reservation" });
    mocks.updateExportJobEnqueueState.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    await recoverStalePendingExportBeforeReservation("user-1");

    expect(mocks.runBuilderJob).toHaveBeenCalledOnce();
    expect(mocks.failExportJobIfPending).not.toHaveBeenCalled();
  });

  it("keeps an already-triggered build pending until the longer watchdog timeout", async () => {
    vi.stubEnv("ANDROID_EXPORT_WATCHDOG_MS", "1500000");
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow({
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      enqueue_state: "triggered",
      builder_operation_name: "operations/active-build",
    }), error: null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toEqual({ kind: "pending", stage: "building" });
    expect(mocks.failExportJobIfPending).not.toHaveBeenCalled();
  });

  it("uses the same one-time recovery retry for an iOS export", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: pendingRow({
      platform: "ios",
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      enqueue_state: "input_ready",
    }), error: null });
    mocks.findBuilderExecution.mockResolvedValue(null);
    mocks.inspectBuilderInput.mockResolvedValue({ complete: true, expectedObjectNames: [], actualObjectNames: [], missingObjectNames: [] });
    mocks.claimExportRecovery.mockResolvedValue({ claimed: true, status: "pending", enqueueState: "triggering", enqueueAttempt: 1 });
    mocks.runBuilderJob.mockResolvedValue({ operationName: "operations/ios-recovered" });
    mocks.updateExportJobEnqueueState.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveExportStatus("user-1", "job-1", "ios");

    expect(result).toEqual({ kind: "pending", stage: "queued" });
    expect(mocks.readBuilderConfig).toHaveBeenCalledWith({ platform: "ios" });
    expect(mocks.claimExportRecovery).toHaveBeenCalledWith({ userId: "user-1", exportJobId: "job-1", expectedAttempt: 0 });
    expect(mocks.runBuilderJob).toHaveBeenCalledWith(expect.anything(), "builder-token", expect.objectContaining({
      exportJobId: "job-1",
      attempt: 1,
    }));
  });

  it("settles a requested cancellation without publishing a failure alert", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow({ cancel_requested_at: new Date().toISOString() }), error: null })
      .mockResolvedValueOnce({ data: pendingRow({ status: "failed", stage: "failed", error: "내보내기 작업이 취소되었습니다.", error_code: "build_cancelled" }), error: null });
    mocks.cancelExportJob.mockResolvedValue({ transitioned: true, status: "failed", balance: 1 });

    const result = await resolveExportStatus("user-1", "job-1", "android");

    expect(result).toMatchObject({ kind: "failed", reason: "build_cancelled" });
    expect(mocks.cancelExportJob).toHaveBeenCalledOnce();
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });
});
