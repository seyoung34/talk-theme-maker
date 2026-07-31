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
} from "@/lib/billing/credits";
import { createStoredZipBytes } from "@/lib/theme/project/zip";
import { buildDownloadContentDisposition, elapsedMs, safeErrorSummary } from "@/lib/theme/export/http";
import { applyServerThemeIdentifier, IosExportRequestError, normalizeIosPath, validateExportName, validateIosPackage } from "@/lib/theme/ios/packageValidation";
import { getExportRequestTooLargePayload, isExportRequestTooLarge, maxExportRequestBytes, themeVersionName } from "@/lib/theme/exportRequest";

type UploadManifestItem = { field: string; path: string };
type ServerAssetManifestItem = { path: string; serverAsset: string };
type IosManifestItem = UploadManifestItem | ServerAssetManifestItem;
type ExportMode = "theme-zip" | "ktheme";

// 편집기는 더 이상 이 값을 읽지 않는다(버전 입력을 없앴다). 배포 교체 중 남아 있는 예전
// 번들이 이 엔드포인트를 부르므로 응답 형태를 유지한다.
export async function GET() {
  return NextResponse.json({ versionName: themeVersionName });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let userId: string | null = null;
  let exportJobId: string | null = null;
  let exportNumber: number | null = null;
  let themeIdentifier: string | null = null;

  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
    userId = user.id;
    if (isExportRequestTooLarge(request)) return NextResponse.json(getExportRequestTooLargePayload(), { status: 413 });

    const formData = await readFormData(request);
    const manifestRaw = formData.get("manifest");
    if (typeof manifestRaw !== "string") return NextResponse.json({ error: "내보내기 파일 목록이 없습니다.", reason: "missing_manifest" }, { status: 400 });

    const modeRaw = formData.get("mode");
    if (modeRaw !== null && !isExportMode(modeRaw)) throw new IosExportRequestError("invalid_export_mode", "지원하지 않는 iOS 출력 형식입니다.");
    const mode: ExportMode = modeRaw ?? "ktheme";
    const exportNameRaw = formData.get("exportName");
    const exportName = validateExportName(exportNameRaw);
    const { entries: requestedEntries, inputBytes } = await readIosEntries(formData, manifestRaw, request.url);

    const reservation = await reserveCreditForExport({
      userId,
      platform: "ios",
      mode,
      inputFileCount: requestedEntries.length,
      inputBytes,
    });
    exportJobId = reservation.exportJobId;
    const identity = await prepareExportJobIdentity({ userId, exportJobId, exportName });
    exportNumber = identity.exportNumber;
    themeIdentifier = identity.themeIdentifier;
    if (!themeIdentifier) throw new IosExportRequestError("missing_theme_identifier", "iOS 테마 식별자를 발급하지 못했습니다.", 500);
    const entries = applyServerThemeIdentifier(requestedEntries, themeIdentifier);
    await updateExportJobStage({ userId, exportJobId, stage: "packaging" });

    const bytes = createStoredZipBytes(entries);
    const fileName = `${buildExportBaseName(exportName)}.${mode === "ktheme" ? "ktheme" : "zip"}`;
    const durationMs = elapsedMs(startedAt);
    const response = new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mode === "ktheme" ? "application/octet-stream" : "application/zip",
        "Content-Disposition": buildDownloadContentDisposition(fileName),
        "X-Export-Job-Id": exportJobId,
        "X-Export-Number": String(exportNumber),
        "X-Theme-Identifier": themeIdentifier,
        "X-Export-Duration-Ms": String(durationMs),
      },
    });
    const credits = await completeExportJob({ userId, exportJobId, fileName, outputBytes: bytes.byteLength, durationMs });
    response.headers.set("X-Credits-Remaining", String(credits));

    console.info(`[ios-export] ${JSON.stringify({ event: "completed", exportJobId, exportNumber, themeIdentifier, mode, durationMs, inputBytes, outputBytes: bytes.byteLength })}`);

    return response;
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

    console.error(`[ios-export] ${JSON.stringify({ event: "failed", exportJobId, durationMs, errorCode: failure.code, error: safeErrorSummary(error) })}`);
    return NextResponse.json({ error: failure.message, reason: failure.code, ...(refunded ? { refunded: true } : {}) }, { status: failure.status });
  }
}

async function readFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    throw new IosExportRequestError("invalid_form_data", "업로드 데이터를 읽지 못했습니다. 파일 크기를 확인한 후 다시 시도해 주세요.");
  }
}

async function readIosEntries(formData: FormData, manifestRaw: string, requestUrl: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch {
    throw new IosExportRequestError("invalid_manifest_json", "내보내기 파일 목록을 읽지 못했습니다.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 300 || !parsed.every(isManifestItem)) {
    throw new IosExportRequestError("invalid_manifest", "내보내기 파일 목록이 올바르지 않습니다.");
  }

  const fields = new Set<string>();
  const paths = new Set<string>();
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  let inputBytes = 0;

  for (const item of parsed) {
    const normalizedPath = normalizeIosPath(item.path);
    if (paths.has(normalizedPath)) {
      throw new IosExportRequestError("invalid_manifest", "중복되거나 올바르지 않은 내보내기 파일이 있습니다.");
    }

    if ("serverAsset" in item) {
      const bytes = await fetchPublicTemplateAsset(item.serverAsset, requestUrl);
      inputBytes = addInputBytes(inputBytes, bytes.byteLength);
      paths.add(normalizedPath);
      entries.push({ path: normalizedPath, bytes });
      continue;
    }

    if (!/^file-\d+$/.test(item.field) || fields.has(item.field)) {
      throw new IosExportRequestError("invalid_manifest", "중복되거나 올바르지 않은 내보내기 파일이 있습니다.");
    }
    const file = formData.get(item.field);
    if (!(file instanceof File)) throw new IosExportRequestError("missing_export_file", `내보내기 파일을 찾을 수 없습니다: ${normalizedPath}`);
    inputBytes = addInputBytes(inputBytes, file.size);
    fields.add(item.field);
    paths.add(normalizedPath);
    entries.push({ path: normalizedPath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  validateIosPackage(entries);
  return { entries, inputBytes };
}


function isManifestItem(value: unknown): value is IosManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;
  const hasField = typeof item.field !== "undefined";
  const hasServerAsset = typeof item.serverAsset !== "undefined";
  if (hasField === hasServerAsset) return false;
  if (hasField) return typeof item.field === "string";
  return typeof item.serverAsset === "string";
}

function addInputBytes(current: number, size: number) {
  const next = current + size;
  if (next > maxExportRequestBytes) throw new IosExportRequestError("export_payload_too_large", "내보낼 파일의 전체 크기는 50MB 이하여야 합니다.", 413);
  return next;
}

async function fetchPublicTemplateAsset(serverAsset: string, requestUrl: string) {
  const assetUrl = resolvePublicTemplateAssetUrl(serverAsset, requestUrl);
  try {
    const response = await fetch(assetUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error(`asset_fetch_failed:${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new IosExportRequestError("missing_server_asset", "기본 테마 에셋을 찾지 못했습니다.");
  }
}

function resolvePublicTemplateAssetUrl(serverAsset: string, requestUrl: string) {
  if (!serverAsset.startsWith("/template-assets/") || serverAsset.includes("\\")) {
    throw new IosExportRequestError("invalid_server_asset", "기본 테마 에셋 참조가 올바르지 않습니다.");
  }

  const relativePath = serverAsset.replace(/^\/+/, "");
  if (relativePath.includes("../") || relativePath.includes("/..") || relativePath === "..") {
    throw new IosExportRequestError("invalid_server_asset", "기본 테마 에셋 참조가 올바르지 않습니다.");
  }

  return new URL(`/${relativePath}`, requestUrl);
}

function isExportMode(value: FormDataEntryValue | null): value is ExportMode {
  return value === "theme-zip" || value === "ktheme";
}

function classifyFailure(error: unknown) {
  if (error instanceof IosExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isExportAlreadyInProgressError(error)) return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  return { code: "ios_export_failed", message: "iOS 내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}

function buildExportBaseName(name: string) {
  return sanitizeFileName(name) || "kakaotalk-theme";
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
