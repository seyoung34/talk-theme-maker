import { NextResponse } from "next/server";
import {
  getCurrentUserOrNull,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  markExportJobBackend,
  prepareExportJobIdentity,
  reserveCreditForExport,
  type ExportMode,
  updateExportJobStage,
} from "@/lib/billing/credits";
import { AndroidBuildEnqueueError, enqueueAndroidBuild } from "@/lib/theme/android/buildJobClient";
import { AndroidExportRequestError, readAndroidBundleUpload } from "@/lib/theme/android/requestShared";
import { AndroidValidationError, validateAndroidApplicationId, validateAndroidVersionName } from "@/lib/theme/android/validation";
import { settleFailedExportJob } from "@/lib/theme/export/asyncExportRoute";
import { elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { getExportRequestTooLargePayload, isExportRequestTooLarge } from "@/lib/theme/exportRequest";
import { CatalogExportResolutionError, resolveCatalogManifestForExport } from "@/lib/theme/assetCatalog/workerResolve";

type AndroidExportMode = Extract<ExportMode, "project" | "apk" | "apk-zip">;

export async function handleAsyncAndroidExportRequest(
  request: Request,
  options: { forcedMode?: AndroidExportMode; exportNameField?: string } = {},
) {
  const startedAt = performance.now();
  let mode: AndroidExportMode = options.forcedMode ?? "apk";
  let userId: string | null = null;
  let exportJobId: string | null = null;

  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
    userId = user.id;

    if (isExportRequestTooLarge(request)) return NextResponse.json(getExportRequestTooLargePayload(), { status: 413 });

    const formData = await readFormData(request);
    const manifestRaw = formData.get("manifest");
    if (typeof manifestRaw !== "string") {
      throw new AndroidExportRequestError("missing_manifest", "내보내기 파일 목록이 없습니다.");
    }

    const modeRaw = formData.get("mode");
    mode = options.forcedMode ?? (isAndroidExportMode(modeRaw) ? modeRaw : "apk");
    if (mode !== "apk") {
      return NextResponse.json({ error: "Cloudflare 내보내기는 APK 비동기 빌드만 지원합니다.", reason: "unsupported_export_mode" }, { status: 400 });
    }

    const exportNameRaw = formData.get(options.exportNameField ?? "exportName");
    const versionNameRaw = formData.get("versionName");
    const exportName = typeof exportNameRaw === "string" && exportNameRaw.trim() ? exportNameRaw.trim() : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim() ? versionNameRaw.trim() : undefined;
    if (versionName) validateAndroidVersionName(versionName);

    const themeIdRaw = formData.get("themeId");
    const themeId = typeof themeIdRaw === "string" && themeIdRaw.trim() ? themeIdRaw.trim().slice(0, 120) : "unknown";
    const { manifest, files, inputBytes } = await readAndroidBundleUpload(formData, manifestRaw);
    const resolved = await resolveCatalogManifestForExport({ manifest, uploadedInputBytes: inputBytes, platform: "android", userId });
    const reservation = await reserveCreditForExport({
      userId,
      platform: "android",
      mode,
      inputFileCount: files.length,
      inputBytes,
      referencedAssetBytes: resolved.referencedAssetBytes,
      referencedAssetFileCount: resolved.referencedAssetFileCount,
    });
    exportJobId = reservation.exportJobId;
    await markExportJobBackend({ userId, exportJobId, backend: "cloud_run" });

    const identity = await prepareExportJobIdentity({ userId, exportJobId, exportName });
    if (!identity.applicationId) throw new AndroidExportRequestError("missing_application_id", "Android 앱 식별자를 발급하지 못했습니다.");
    validateAndroidApplicationId(identity.applicationId);
    await updateExportJobStage({ userId, exportJobId, stage: "preparing" });

    await enqueueAndroidBuild({
      exportJobId,
      userId,
      themeId,
      options: { mode, exportName, versionName, applicationId: identity.applicationId },
      manifest: resolved.manifest,
      files,
    });

    logAndroidExport("info", "enqueued", {
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
    });
    return NextResponse.json(
      { exportJobId, exportNumber: identity.exportNumber, applicationId: identity.applicationId, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    const failure = classifyFailure(error);
    const durationMs = elapsedMs(startedAt);
    let refunded = false;
    if (userId && exportJobId) {
      refunded = await settleFailedExportJob({
        userId,
        exportJobId,
        errorCode: error instanceof AndroidBuildEnqueueError ? error.code : failure.code,
        errorMessage: failure.message,
        durationMs,
      }, "android-export");
    }
    logAndroidExport("error", "failed", {
      exportJobId,
      mode,
      durationMs,
      errorCode: failure.code,
      error: safeErrorSummary(error),
    });
    return NextResponse.json({ error: failure.message, reason: failure.code, ...(refunded ? { refunded: true } : {}) }, { status: failure.status });
  }
}

async function readFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    throw new AndroidExportRequestError("invalid_form_data", "업로드 데이터를 읽지 못했습니다. 파일 크기를 확인한 후 다시 시도해 주세요.");
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof AndroidExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof AndroidValidationError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof CatalogExportResolutionError) return { code: error.code, message: error.message, status: error.status };
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isExportAlreadyInProgressError(error)) {
    return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  }
  return { code: "android_export_failed", message: "Android 내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}

function isAndroidExportMode(value: FormDataEntryValue | null): value is AndroidExportMode {
  return value === "project" || value === "apk" || value === "apk-zip";
}

function logAndroidExport(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  console[level](`[android-export] ${JSON.stringify({ event, ...details })}`);
}
