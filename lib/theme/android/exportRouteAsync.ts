import { NextResponse } from "next/server";
import {
  failExportJob,
  getCurrentUserOrNull,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  prepareExportJobIdentity,
  reserveCreditForExport,
  type ExportMode,
} from "@/lib/billing/credits";
import { AndroidBuildEnqueueError, enqueueAndroidBuild } from "@/lib/theme/android/buildJobClient";
import { AndroidExportRequestError, readAndroidBundleUpload } from "@/lib/theme/android/requestShared";
import { AndroidValidationError, validateAndroidApplicationId, validateAndroidVersionName } from "@/lib/theme/android/validation";
import { elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { getExportRequestTooLargePayload, isExportRequestTooLarge } from "@/lib/theme/exportRequest";

type AndroidExportMode = Extract<ExportMode, "project" | "apk" | "apk-zip">;

export async function handleAsyncAndroidExportRequest(
  request: Request,
  options: { forcedMode?: AndroidExportMode; exportNameField?: string } = {},
) {
  const startedAt = performance.now();
  let mode: AndroidExportMode = options.forcedMode ?? "apk";

  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

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

    return await enqueueAsyncAndroidExport({ formData, manifestRaw, user, mode, exportName, versionName });
  } catch (error) {
    const failure = classifyFailure(error);
    logAndroidExport("error", "failed", {
      mode,
      durationMs: elapsedMs(startedAt),
      errorCode: failure.code,
      error: safeErrorSummary(error),
    });
    return NextResponse.json({ error: failure.message, reason: failure.code }, { status: failure.status });
  }
}

async function enqueueAsyncAndroidExport(args: {
  formData: FormData;
  manifestRaw: string;
  user: { id: string };
  mode: Extract<AndroidExportMode, "apk">;
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
    await failExportJob({
      userId: user.id,
      exportJobId: reservation.exportJobId,
      errorCode: error instanceof AndroidBuildEnqueueError ? error.code : "enqueue_failed",
      errorMessage: "빌드 작업을 시작하지 못했습니다.",
      durationMs: 0,
    }).catch(() => undefined);
    logAndroidExport("error", "enqueue_failed", {
      exportJobId: reservation.exportJobId,
      mode,
      errorCode: error instanceof AndroidBuildEnqueueError ? error.code : "enqueue_failed",
    });
    return NextResponse.json({ error: "빌드 작업을 시작하지 못했습니다.", reason: "enqueue_failed", refunded: true }, { status: 502 });
  }

  logAndroidExport("info", "enqueued", {
    exportJobId: reservation.exportJobId,
    exportNumber: identity.exportNumber,
    mode,
    inputFileCount: files.length,
    inputBytes,
  });
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

function classifyFailure(error: unknown) {
  if (error instanceof AndroidExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof AndroidValidationError) return { code: error.code, message: error.message, status: error.status };
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
