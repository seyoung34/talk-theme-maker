import { NextResponse } from "next/server";
import {
  completeExportJob,
  failExportJob,
  getCurrentUserOrNull,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  prepareExportJobIdentity,
  reserveCreditForExport,
  updateExportJobStage,
  type ExportMode,
} from "@/lib/billing/credits";
import { isAdminUser } from "@/lib/supabase/auth";
import {
  AndroidBuildError,
  buildAndroidApk,
  exportAndroidApkZip,
  exportAndroidProjectZip,
  validateAndroidApplicationId,
  validateAndroidVersionName,
  type AndroidBuildHooks,
} from "@/lib/theme/android/apk";
import { AndroidExportRequestError, readAndroidBuildInputFiles, readAndroidBundleUpload } from "@/lib/theme/android/request";
import { AndroidBuildEnqueueError, enqueueAndroidBuild, isAsyncAndroidExportEnabled } from "@/lib/theme/android/buildJobClient";
import { buildDownloadContentDisposition, elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { getExportRequestTooLargePayload, isExportRequestTooLarge } from "@/lib/theme/exportRequest";

type AndroidExportMode = Extract<ExportMode, "project" | "apk" | "apk-zip">;

export async function handleAndroidExportRequest(
  request: Request,
  options: { forcedMode?: AndroidExportMode; exportNameField?: string } = {},
) {
  const startedAt = performance.now();
  let userId: string | null = null;
  let exportJobId: string | null = null;
  let exportNumber: number | null = null;
  let applicationId: string | null = null;
  let mode: AndroidExportMode = options.forcedMode ?? "apk";

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
    if (mode === "project" && !(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "프로젝트 내보내기는 관리자만 사용할 수 있습니다.", reason: "admin_required" }, { status: 403 });
    }
    const exportNameRaw = formData.get(options.exportNameField ?? "exportName");
    const versionNameRaw = formData.get("versionName");
    const exportName = typeof exportNameRaw === "string" && exportNameRaw.trim() ? exportNameRaw.trim() : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim() ? versionNameRaw.trim() : undefined;

    if (versionName) validateAndroidVersionName(versionName);

    // 비동기(Cloud Run Job) 경로: 플래그가 켜지면 동기 빌드 대신 큐잉+Job 트리거 후 즉시 반환한다.
    if (isAsyncAndroidExportEnabled() && mode === "apk") {
      return await enqueueAsyncAndroidExport({ formData, manifestRaw, user, mode, exportName, versionName });
    }

    const { files, inputBytes } = await readAndroidBuildInputFiles(formData, manifestRaw);
    const reservation = await reserveCreditForExport({
      userId,
      platform: "android",
      mode,
      inputFileCount: files.length,
      inputBytes,
    });
    exportJobId = reservation.exportJobId;
    const identity = await prepareExportJobIdentity({ userId, exportJobId, exportName });
    exportNumber = identity.exportNumber;
    applicationId = identity.applicationId;
    if (!applicationId) throw new AndroidExportRequestError("missing_application_id", "Android 앱 식별자를 발급하지 못했습니다.");
    validateAndroidApplicationId(applicationId);

    logAndroidExport("info", "reserved", { exportJobId, exportNumber, applicationId, mode, inputFileCount: files.length, inputBytes });

    const hooks: AndroidBuildHooks = {
      signal: request.signal,
      onStage: async (stage) => {
        logAndroidExport("info", "stage", { exportJobId, mode, stage, elapsedMs: elapsedMs(startedAt) });
        try {
          await updateExportJobStage({ userId: userId!, exportJobId: exportJobId!, stage });
        } catch (error) {
          logAndroidExport("warn", "stage_update_failed", { exportJobId, mode, stage, error: safeErrorSummary(error) });
        }
      },
    };

    const result = await buildResult(mode, files, exportName, { versionName, applicationId }, hooks);
    const durationMs = elapsedMs(startedAt);
    const credits = await completeExportJob({
      userId,
      exportJobId,
      fileName: result.fileName,
      outputBytes: result.bytes.byteLength,
      durationMs,
    });

    logAndroidExport("info", "completed", { exportJobId, mode, durationMs, outputBytes: result.bytes.byteLength });

    return new NextResponse(result.bytes, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": buildDownloadContentDisposition(result.fileName),
        "X-Credits-Remaining": String(credits),
        "X-Export-Job-Id": exportJobId,
        "X-Export-Number": String(exportNumber),
        "X-Application-Id": applicationId,
        "X-Export-Duration-Ms": String(durationMs),
      },
    });
  } catch (error) {
    const failure = classifyFailure(error);
    const durationMs = elapsedMs(startedAt);
    let refunded = false;

    if (userId && exportJobId) {
      try {
        await failExportJob({
          userId,
          exportJobId,
          errorCode: failure.code,
          errorMessage: failure.message,
          durationMs,
        });
        refunded = true;
      } catch (refundError) {
        logAndroidExport("error", "refund_failed", { exportJobId, mode, error: safeErrorSummary(refundError) });
      }
    }

    logAndroidExport("error", "failed", {
      exportJobId,
      mode,
      durationMs,
      errorCode: failure.code,
      error: safeErrorSummary(error),
      buildLogTail: error instanceof AndroidBuildError ? error.logTail?.slice(-8000) : undefined,
    });

    return NextResponse.json(
      { error: failure.message, reason: failure.code, ...(refunded ? { refunded: true } : {}) },
      { status: failure.status },
    );
  }
}

async function enqueueAsyncAndroidExport(args: {
  formData: FormData;
  manifestRaw: string;
  user: { id: string };
  mode: AndroidExportMode;
  exportName: string;
  versionName?: string;
}) {
  const { formData, manifestRaw, user, mode, exportName, versionName } = args;
  const themeIdRaw = formData.get("themeId");
  const themeId = typeof themeIdRaw === "string" && themeIdRaw.trim() ? themeIdRaw.trim().slice(0, 120) : "unknown";

  const { manifest, files, inputBytes } = await readAndroidBundleUpload(formData, manifestRaw);
  const reservation = await reserveCreditForExport({ userId: user.id, platform: "android", mode, inputFileCount: files.length, inputBytes });
  const identity = await prepareExportJobIdentity({ userId: user.id, exportJobId: reservation.exportJobId, exportName });
  if (!identity.applicationId) throw new AndroidExportRequestError("missing_application_id", "Android 앱 식별자를 발급하지 못했습니다.");
  validateAndroidApplicationId(identity.applicationId);

  try {
    await enqueueAndroidBuild({
      exportJobId: reservation.exportJobId,
      userId: user.id,
      themeId,
      options: { mode, exportName, versionName, applicationId: identity.applicationId },
      manifest,
      files,
    });
  } catch (error) {
    // 큐잉 실패 시 즉시 환불(불변식 4). failExportJob은 멱등이라 안전하다.
    await failExportJob({
      userId: user.id,
      exportJobId: reservation.exportJobId,
      errorCode: error instanceof AndroidBuildEnqueueError ? error.code : "enqueue_failed",
      errorMessage: "빌드 작업을 시작하지 못했습니다.",
      durationMs: 0,
    }).catch(() => undefined);
    logAndroidExport("error", "enqueue_failed", { exportJobId: reservation.exportJobId, mode, errorCode: error instanceof AndroidBuildEnqueueError ? error.code : "enqueue_failed" });
    return NextResponse.json({ error: "빌드 작업을 시작하지 못했습니다.", reason: "enqueue_failed", refunded: true }, { status: 502 });
  }

  logAndroidExport("info", "enqueued", { exportJobId: reservation.exportJobId, exportNumber: identity.exportNumber, mode, inputFileCount: files.length, inputBytes });
  return NextResponse.json(
    { exportJobId: reservation.exportJobId, exportNumber: identity.exportNumber, applicationId: identity.applicationId, status: "queued" },
    { status: 202 },
  );
}

async function readFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    throw new AndroidExportRequestError("invalid_form_data", "업로드 데이터를 읽지 못했습니다. 파일 크기를 확인한 후 다시 시도해 주세요.");
  }
}

async function buildResult(
  mode: AndroidExportMode,
  files: Awaited<ReturnType<typeof readAndroidBuildInputFiles>>["files"],
  exportName: string,
  options: { versionName?: string; applicationId?: string },
  hooks: AndroidBuildHooks,
) {
  if (mode === "project") {
    const result = await exportAndroidProjectZip(files, exportName, options, hooks);
    return { bytes: result.zipBytes, fileName: result.fileName, contentType: "application/zip" };
  }
  if (mode === "apk-zip") {
    const result = await exportAndroidApkZip(files, exportName, options, hooks);
    return { bytes: result.zipBytes, fileName: result.fileName, contentType: "application/zip" };
  }
  const result = await buildAndroidApk(files, exportName, options, hooks);
  return { bytes: result.apkBytes, fileName: result.fileName, contentType: "application/vnd.android.package-archive" };
}

function classifyFailure(error: unknown) {
  if (error instanceof AndroidExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof AndroidBuildError) {
    const status = error.code.startsWith("invalid_") ? 400 : error.code === "build_capacity_reached" || error.code === "android_sdk_missing" ? 503 : error.code === "gradle_timeout" ? 504 : error.code === "build_cancelled" ? 408 : 500;
    return { code: error.code, message: error.clientMessage, status };
  }
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isExportAlreadyInProgressError(error)) return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  return { code: "android_export_failed", message: "Android 내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}

function isAndroidExportMode(value: FormDataEntryValue | null): value is AndroidExportMode {
  return value === "project" || value === "apk" || value === "apk-zip";
}

function logAndroidExport(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  console[level](`[android-export] ${JSON.stringify({ event, ...details })}`);
}
