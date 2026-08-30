import { failExportJob } from "@/lib/billing/credits";
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
// 두 번 시도하되, 이미 정산된 작업은 RPC의 멱등 처리에 맡긴다.
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
