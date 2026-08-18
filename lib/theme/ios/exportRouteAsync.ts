import { NextResponse } from "next/server";
import {
  failExportJob,
  getCurrentUserOrNull,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  markExportJobBackend,
  prepareExportJobIdentity,
  reserveCreditForExport,
  updateExportJobStage,
} from "@/lib/billing/credits";
import { elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { getExportRequestTooLargePayload, isExportRequestTooLarge } from "@/lib/theme/exportRequest";
import { IosExportRequestError, validateExportName } from "@/lib/theme/ios/packageValidation";
import { enqueueIosBuild, IosBuildEnqueueError } from "@/lib/theme/ios/buildJobClient";
import { isIosExportMode, readIosEntries, readIosFormData } from "@/lib/theme/ios/requestShared";

export async function handleAsyncIosExportRequest(request: Request) {
  const startedAt = performance.now();
  let userId: string | null = null;
  let exportJobId: string | null = null;
  let mode: "theme-zip" | "ktheme" = "ktheme";

  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
    userId = user.id;

    if (isExportRequestTooLarge(request)) return NextResponse.json(getExportRequestTooLargePayload(), { status: 413 });

    const formData = await readIosFormData(request);
    const manifestRaw = formData.get("manifest");
    if (typeof manifestRaw !== "string") throw new IosExportRequestError("missing_manifest", "내보내기 파일 목록이 없습니다.");

    const modeRaw = formData.get("mode");
    if (modeRaw !== null && !isIosExportMode(modeRaw)) {
      throw new IosExportRequestError("invalid_export_mode", "지원하지 않는 iOS 출력 형식입니다.");
    }
    mode = modeRaw ?? "ktheme";
    const exportName = validateExportName(formData.get("exportName"));
    const { entries: requestedEntries, inputBytes } = await readIosEntries(formData, manifestRaw, request.url);

    const reservation = await reserveCreditForExport({
      userId,
      platform: "ios",
      mode,
      inputFileCount: requestedEntries.length,
      inputBytes,
    });
    exportJobId = reservation.exportJobId;
    await markExportJobBackend({ userId, exportJobId, backend: "cloud_run" });

    const identity = await prepareExportJobIdentity({ userId, exportJobId, exportName });
    if (!identity.themeIdentifier) {
      throw new IosExportRequestError("missing_theme_identifier", "iOS 테마 식별자를 발급하지 못했습니다.", 500);
    }

    // Worker에서는 CSS 식별자 치환·재검증·압축을 하지 않는다.
    // 입력 검증은 이미 한 번 끝났고, 최종 식별자 반영과 패키지 검증은 Cloud Run에서 수행한다.
    const files = requestedEntries.map((entry, index) => ({ field: `file-${index}`, bytes: entry.bytes }));
    const manifest = requestedEntries.map((entry, index) => ({ path: entry.path, field: `file-${index}` }));

    await updateExportJobStage({ userId, exportJobId, stage: "preparing" });
    await enqueueIosBuild({
      exportJobId,
      userId,
      options: { mode, exportName, themeIdentifier: identity.themeIdentifier },
      manifest,
      files,
    });

    console.info(`[ios-export] ${JSON.stringify({
      event: "enqueued",
      exportJobId,
      exportNumber: identity.exportNumber,
      mode,
      inputFileCount: files.length,
      inputBytes,
      durationMs: elapsedMs(startedAt),
    })}`);

    return NextResponse.json(
      { exportJobId, exportNumber: identity.exportNumber, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    const durationMs = elapsedMs(startedAt);
    const failure = classifyFailure(error);
    let refunded = false;

    if (userId && exportJobId) {
      try {
        await failExportJob({ userId, exportJobId, errorCode: failure.code, errorMessage: failure.message, durationMs });
        refunded = true;
      } catch (refundError) {
        console.error(`[ios-export] ${JSON.stringify({ event: "refund_failed", exportJobId, error: safeErrorSummary(refundError) })}`);
      }
    }

    console.error(`[ios-export] ${JSON.stringify({
      event: "failed",
      exportJobId,
      mode,
      durationMs,
      errorCode: failure.code,
      error: safeErrorSummary(error),
    })}`);
    return NextResponse.json({ error: failure.message, reason: failure.code, ...(refunded ? { refunded: true } : {}) }, { status: failure.status });
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof IosExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof IosBuildEnqueueError) return { code: "enqueue_failed", message: "내보내기 작업을 시작하지 못했습니다.", status: 502 };
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isExportAlreadyInProgressError(error)) return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  return { code: "ios_export_failed", message: "iOS 내보내기 작업을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}
