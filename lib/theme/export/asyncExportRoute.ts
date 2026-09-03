import { failExportJob, getExportJobStatus } from "@/lib/billing/credits";
import { createExportRefundFailureEvent } from "@/lib/ops/eventFactories";
import { scheduleOpsEvent } from "@/lib/ops/dispatcher";
import { safeErrorSummary } from "@/lib/theme/export/http";

type FailedExportJob = {
  userId: string;
  exportJobId: string;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
};

// 예약 직후의 실패는 네트워크·DB 오류로 정산 요청 자체가 유실될 수 있다.
// 두 번 시도하고, 둘 다 실패하면 작업의 최신 상태를 읽어 이미 끝난 작업을 오경보에서 제외한다.
export async function settleFailedExportJob(args: FailedExportJob, logPrefix: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await failExportJob(args);
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const status = await getExportJobStatus({ userId: args.userId, exportJobId: args.exportJobId });
    // A timed-out enqueue request can arrive here after the builder has already completed the job.
    // That is a successful terminal state, not evidence that the credit refund failed.
    if (status === "succeeded") return false;
    // Another request may have performed the refund while this request was retrying.
    if (status === "failed") return true;
  } catch (statusError) {
    lastError = statusError;
  }

  console.error(`[${logPrefix}] ${JSON.stringify({
    event: "refund_failed",
    exportJobId: args.exportJobId,
    error: safeErrorSummary(lastError),
  })}`);
  scheduleOpsEvent(createExportRefundFailureEvent({
    platform: logPrefix.startsWith("ios") ? "ios" : "android",
    exportJobId: args.exportJobId,
    errorCode: args.errorCode,
  }));
  return false;
}
