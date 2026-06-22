import { NextResponse } from "next/server";
import {
  completeExportJob,
  failExportJob,
  getCurrentUserOrNull,
  isExportAlreadyInProgressError,
  isInsufficientCreditsError,
  reserveCreditForExport,
  updateExportJobStage,
} from "@/lib/billing/credits";
import { createStoredZip } from "@/lib/theme/project/zip";
import { getExportRequestTooLargePayload, isExportRequestTooLarge, maxExportRequestBytes } from "@/lib/theme/exportRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

type UploadManifestItem = { field: string; path: string };
type ExportMode = "theme-zip" | "ktheme";

export async function GET() {
  return NextResponse.json({ versionName: "1.0.0" });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let userId: string | null = null;
  let exportJobId: string | null = null;

  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
    userId = user.id;
    if (isExportRequestTooLarge(request)) return NextResponse.json(getExportRequestTooLargePayload(), { status: 413 });

    const formData = await readFormData(request);
    const manifestRaw = formData.get("manifest");
    if (typeof manifestRaw !== "string") return NextResponse.json({ error: "내보내기 파일 목록이 없습니다.", reason: "missing_manifest" }, { status: 400 });

    const modeRaw = formData.get("mode");
    const mode: ExportMode = isExportMode(modeRaw) ? modeRaw : "ktheme";
    const exportNameRaw = formData.get("exportName");
    const versionNameRaw = formData.get("versionName");
    const exportName = typeof exportNameRaw === "string" && exportNameRaw.trim() ? exportNameRaw.trim() : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim() ? versionNameRaw.trim() : "1.0.0";
    const { entries, inputBytes } = await readIosEntries(formData, manifestRaw);

    const reservation = await reserveCreditForExport({
      userId,
      platform: "ios",
      mode,
      inputFileCount: entries.length,
      inputBytes,
    });
    exportJobId = reservation.exportJobId;
    await updateExportJobStage({ userId, exportJobId, stage: "packaging" });

    const zipBlob = createStoredZip(entries);
    const bytes = new Uint8Array(await zipBlob.arrayBuffer());
    const fileName = `${buildExportBaseName(exportName, versionName)}.${mode === "ktheme" ? "ktheme" : "zip"}`;
    const durationMs = elapsedMs(startedAt);
    const credits = await completeExportJob({ userId, exportJobId, fileName, outputBytes: bytes.byteLength, durationMs });

    console.info(`[ios-export] ${JSON.stringify({ event: "completed", exportJobId, mode, durationMs, inputBytes, outputBytes: bytes.byteLength })}`);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mode === "ktheme" ? "application/octet-stream" : "application/zip",
        "Content-Disposition": buildContentDisposition(fileName),
        "X-Credits-Remaining": String(credits),
        "X-Export-Job-Id": exportJobId,
        "X-Export-Duration-Ms": String(durationMs),
      },
    });
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

async function readIosEntries(formData: FormData, manifestRaw: string) {
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
    if (!/^file-\d+$/.test(item.field) || fields.has(item.field) || paths.has(normalizedPath)) {
      throw new IosExportRequestError("invalid_manifest", "중복되거나 올바르지 않은 내보내기 파일이 있습니다.");
    }
    const file = formData.get(item.field);
    if (!(file instanceof File)) throw new IosExportRequestError("missing_export_file", `내보내기 파일을 찾을 수 없습니다: ${normalizedPath}`);
    inputBytes += file.size;
    if (inputBytes > maxExportRequestBytes) throw new IosExportRequestError("export_payload_too_large", "내보낼 파일의 전체 크기는 50MB 이하여야 합니다.", 413);
    fields.add(item.field);
    paths.add(normalizedPath);
    entries.push({ path: normalizedPath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  return { entries, inputBytes };
}

function normalizeIosPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized === "KakaoTalkTheme.css") return normalized;
  if (normalized.startsWith("Images/") && /\.png$/i.test(normalized) && !normalized.includes("../") && !/[\u0000-\u001f]/.test(normalized)) return normalized;
  throw new IosExportRequestError("forbidden_export_path", "iOS 테마 리소스 경로가 올바르지 않습니다.");
}

function isManifestItem(value: unknown): value is UploadManifestItem {
  return typeof value === "object" && value !== null && "field" in value && "path" in value && typeof value.field === "string" && typeof value.path === "string";
}

function isExportMode(value: FormDataEntryValue | null): value is ExportMode {
  return value === "theme-zip" || value === "ktheme";
}

class IosExportRequestError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "IosExportRequestError";
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof IosExportRequestError) return { code: error.code, message: error.message, status: error.status };
  if (isInsufficientCreditsError(error)) return { code: "insufficient_credits", message: "크레딧이 부족합니다.", status: 402 };
  if (isExportAlreadyInProgressError(error)) return { code: "export_already_in_progress", message: "이미 진행 중인 내보내기가 있습니다. 완료 후 다시 시도해 주세요.", status: 409 };
  return { code: "ios_export_failed", message: "iOS 내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}

function buildExportBaseName(name: string, versionName: string) {
  return `${sanitizeFileName(name) || "kakaotalk-theme"}_${sanitizeFileName(versionName) || "1.0.0"}`;
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]+/g, "-");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function safeErrorSummary(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 1000) : String(error).slice(0, 1000);
}
