import type { AndroidBuildInputFile } from "@/lib/theme/android/apk";
import { maxExportRequestBytes } from "@/lib/theme/exportRequest";

const maxAndroidExportFiles = 300;
const maxAndroidExportFileBytes = 20 * 1024 * 1024;
const safeRootFiles = new Set(["README-export.txt", "theme-export-report.json"]);

type UploadManifestItem = { field: string; path: string };

export class AndroidExportRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AndroidExportRequestError";
  }
}

export async function readAndroidBuildInputFiles(formData: FormData, manifestRaw: string) {
  const manifest = parseManifest(manifestRaw);
  const fields = new Set<string>();
  const paths = new Set<string>();
  const files: AndroidBuildInputFile[] = [];
  let inputBytes = 0;

  for (const item of manifest) {
    if (!/^file-\d+$/.test(item.field) || fields.has(item.field)) {
      throw new AndroidExportRequestError("invalid_manifest_field", "내보내기 파일 목록이 올바르지 않습니다.");
    }

    const normalizedPath = normalizeAndValidatePath(item.path);
    if (paths.has(normalizedPath)) {
      throw new AndroidExportRequestError("duplicate_export_path", "중복된 Android 리소스 경로가 있습니다.");
    }

    const file = formData.get(item.field);
    if (!(file instanceof File)) {
      throw new AndroidExportRequestError("missing_export_file", `내보내기 파일을 찾을 수 없습니다: ${normalizedPath}`);
    }
    if (file.size > maxAndroidExportFileBytes) {
      throw new AndroidExportRequestError("export_file_too_large", "개별 이미지 파일은 20MB 이하여야 합니다.", 413);
    }

    inputBytes += file.size;
    if (inputBytes > maxExportRequestBytes) {
      throw new AndroidExportRequestError("export_payload_too_large", "내보낼 파일의 전체 크기는 50MB 이하여야 합니다.", 413);
    }

    fields.add(item.field);
    paths.add(normalizedPath);
    files.push({ path: normalizedPath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  return { files, inputBytes };
}

function parseManifest(value: string): UploadManifestItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AndroidExportRequestError("invalid_manifest_json", "내보내기 파일 목록을 읽지 못했습니다.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > maxAndroidExportFiles) {
    throw new AndroidExportRequestError("invalid_manifest_count", `Android 내보내기는 1~${maxAndroidExportFiles}개 파일을 지원합니다.`);
  }

  if (!parsed.every((item) => isManifestItem(item))) {
    throw new AndroidExportRequestError("invalid_manifest_item", "내보내기 파일 목록이 올바르지 않습니다.");
  }
  return parsed;
}

function isManifestItem(value: unknown): value is UploadManifestItem {
  return typeof value === "object" && value !== null && "field" in value && "path" in value && typeof value.field === "string" && typeof value.path === "string";
}

function normalizeAndValidatePath(value: string) {
  if (!value || value.length > 240 || /[\u0000-\u001f]/.test(value)) {
    throw new AndroidExportRequestError("invalid_export_path", "Android 리소스 경로가 올바르지 않습니다.");
  }

  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.includes("../") || normalized.includes("/..") || normalized === "..") {
    throw new AndroidExportRequestError("invalid_export_path", "Android 리소스 경로가 올바르지 않습니다.");
  }

  if (safeRootFiles.has(normalized)) return normalized;
  if (!normalized.startsWith("src/main/theme/")) {
    throw new AndroidExportRequestError("forbidden_export_path", "Android 테마 리소스 경로만 내보낼 수 있습니다.");
  }
  if (!/^src\/main\/theme\/(?:drawable(?:-[a-z0-9-]+)?|values(?:-[a-z0-9-]+)?)\/[a-z0-9_]+(?:\.9)?\.(?:png|xml)$/.test(normalized)) {
    throw new AndroidExportRequestError("forbidden_export_file_type", "허용된 Android drawable·values 리소스만 내보낼 수 있습니다.");
  }
  return normalized;
}
