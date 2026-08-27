import { NextResponse } from "next/server";
import {
  getCurrentUserOrNull,
  isBillingHoldError,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  markExportJobBackend,
  prepareExportJobIdentity,
  reserveCreditForExport,
  updateExportJobStage,
} from "@/lib/billing/credits";
import { elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { settleFailedExportJob } from "@/lib/theme/export/asyncExportRoute";
import { getExportRequestTooLargePayload, isExportRequestTooLarge } from "@/lib/theme/exportRequest";
import { IosExportRequestError, validateExportName, validateIosPackage } from "@/lib/theme/ios/packageValidation";
import { enqueueIosBuild, IosBuildEnqueueError } from "@/lib/theme/ios/buildJobClient";
import { isIosExportMode, readIosEntries, readIosFormData, type IosRequestedEntry } from "@/lib/theme/ios/requestShared";
import { CatalogExportResolutionError, resolveCatalogManifestForExport } from "@/lib/theme/assetCatalog/workerResolve";

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
    const manifestForResolve = requestedEntries.map((entry, index) =>
      "catalogAsset" in entry
        ? {
            path: entry.path,
            catalogAsset: entry.catalogAsset,
            ...(entry.resourceRole ? { resourceRole: entry.resourceRole } : {}),
            ...(entry.transform ? { transform: entry.transform } : {}),
          }
        : { path: entry.path, field: `file-${index}` },
    );
    const resolved = await resolveCatalogManifestForExport({ manifest: manifestForResolve, uploadedInputBytes: inputBytes, platform: "ios", userId });

    // CSS와 field 이미지는 Worker에서 검사하고, catalog 이미지는 registry의 PNG attestation을
    // 사용한다. 실제 바이트 대조는 Cloud Run Builder가 GCS object를 읽은 뒤 다시 수행한다.
    const catalogByPath = new Map(
      resolved.manifest
        .filter((item) => "catalogObject" in item)
        .map((item) => [item.path, item.catalogObject]),
    );
    validateIosPackage(requestedEntries.map((entry) => {
      if (!("catalogAsset" in entry)) return entry;
      const catalogObject = catalogByPath.get(entry.path);
      return { path: entry.path, bytes: new Uint8Array(), pngSignatureVerified: catalogObject?.pngSignatureVerified === true };
    }));

    const reservation = await reserveCreditForExport({
      userId,
      platform: "ios",
      mode,
      inputFileCount: requestedEntries.filter((entry) => !isCatalogRequestedEntry(entry)).length,
      inputBytes,
      referencedAssetBytes: resolved.referencedAssetBytes,
      referencedAssetFileCount: resolved.referencedAssetFileCount,
    });
    exportJobId = reservation.exportJobId;
    await markExportJobBackend({ userId, exportJobId, backend: "cloud_run" });

    const identity = await prepareExportJobIdentity({ userId, exportJobId, exportName });
    if (!identity.themeIdentifier) {
      throw new IosExportRequestError("missing_theme_identifier", "iOS 테마 식별자를 발급하지 못했습니다.", 500);
    }

    // Worker에서는 CSS 식별자 치환·재검증·압축을 하지 않는다.
    // 입력 검증은 이미 한 번 끝났고, 최종 식별자 반영과 패키지 검증은 Cloud Run에서 수행한다.
    const files = requestedEntries.flatMap((entry, index) => isCatalogRequestedEntry(entry) ? [] : [{ field: `file-${index}`, bytes: entry.bytes }]);

    await updateExportJobStage({ userId, exportJobId, stage: "preparing" });
    await enqueueIosBuild({
      exportJobId,
      userId,
      options: { mode, exportName, themeIdentifier: identity.themeIdentifier },
      manifest: resolved.manifest,
      files,
    });

    console.info(`[ios-export] ${JSON.stringify({
      event: "enqueued",
      exportJobId,
      exportNumber: identity.exportNumber,
      mode,
      inputFileCount: files.length,
      inputBytes,
      referencedAssetBytes: resolved.referencedAssetBytes,
      referencedAssetFileCount: resolved.referencedAssetFileCount,
      uniqueReferencedAssetBytes: resolved.uniqueReferencedAssetBytes,
      logicalInputBytes: inputBytes + resolved.referencedAssetBytes,
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
      refunded = await settleFailedExportJob({
        userId,
        exportJobId,
        errorCode: error instanceof IosBuildEnqueueError ? error.code : failure.code,
        errorMessage: failure.message,
        durationMs,
      }, "ios-export");
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
  if (error instanceof CatalogExportResolutionError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof IosBuildEnqueueError) return { code: "enqueue_failed", message: "내보내기 작업을 시작하지 못했습니다.", status: 502 };
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isBillingHoldError(error)) return { code: "billing_hold", message: "환불 조정 중인 계정입니다. 고객지원에 문의해 주세요.", status: 409 };
  if (isExportAlreadyInProgressError(error)) return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  return { code: "ios_export_failed", message: "iOS 내보내기 작업을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}

function isCatalogRequestedEntry(entry: IosRequestedEntry): entry is Extract<IosRequestedEntry, { catalogAsset: unknown }> {
  return "catalogAsset" in entry;
}
