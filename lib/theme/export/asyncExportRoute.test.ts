import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleFailedExportJob } from "@/lib/theme/export/asyncExportRoute";

const mocks = vi.hoisted(() => ({
  failExportJob: vi.fn(),
  getExportJobStatus: vi.fn(),
  scheduleOpsEvent: vi.fn(),
}));

vi.mock("@/lib/billing/credits", () => ({
  failExportJob: mocks.failExportJob,
  getExportJobStatus: mocks.getExportJobStatus,
}));
vi.mock("@/lib/ops/dispatcher", () => ({ scheduleOpsEvent: mocks.scheduleOpsEvent }));

describe("settleFailedExportJob", () => {
  beforeEach(() => {
    mocks.failExportJob.mockReset();
    mocks.getExportJobStatus.mockReset();
    mocks.scheduleOpsEvent.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const args = {
    userId: "user-1",
    exportJobId: "job-1",
    errorCode: "enqueue_failed",
    errorMessage: "failed",
    durationMs: 100,
  };

  it("does not report a refund failure when the builder already succeeded", async () => {
    mocks.failExportJob.mockRejectedValue(new Error("export_job_not_pending"));
    mocks.getExportJobStatus.mockResolvedValue("succeeded");

    await expect(settleFailedExportJob(args, "android-export")).resolves.toBe(false);
    expect(mocks.getExportJobStatus).toHaveBeenCalledWith({ userId: "user-1", exportJobId: "job-1" });
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("treats a refund completed by another request as settled", async () => {
    mocks.failExportJob.mockRejectedValue(new Error("export_job_not_pending"));
    mocks.getExportJobStatus.mockResolvedValue("failed");

    await expect(settleFailedExportJob(args, "ios-export")).resolves.toBe(true);
    expect(mocks.scheduleOpsEvent).not.toHaveBeenCalled();
  });

  it("keeps the P1 alert when the job is still pending after retries", async () => {
    mocks.failExportJob.mockRejectedValue(new Error("database unavailable"));
    mocks.getExportJobStatus.mockResolvedValue("pending");

    await expect(settleFailedExportJob(args, "android-export")).resolves.toBe(false);
    expect(mocks.scheduleOpsEvent).toHaveBeenCalledOnce();
  });
});
