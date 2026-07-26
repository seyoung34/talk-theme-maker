import { maxExportRequestBytes } from "@/lib/theme/exportRequest";

const maxAndroidExportFiles = 300;
export const maxAndroidExportFileBytes = 20 * 1024 * 1024;
const safeRootFiles = new Set(["README-export.txt", "theme-export-report.json"]);

type UploadManifestItem = { field: string; path: string };
type ServerAssetManifestItem = { path: string; serverAsset: string };
export type AndroidExportManifestItem = UploadManifestItem | ServerAssetManifestItem;

export type AndroidBundleUploadFile = { field: string; bytes: Uint8Array };

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

export async function readAndroidBundleUpload(formData: FormData, manifestRaw: string) {
  const manifest = parseManifest(manifestRaw);
  const fields = new Set<string>();
  const paths = new Set<string>();
  const files: AndroidBundleUploadFile[] = [];
  let inputBytes = 0;

  for (const item of manifest) {
    const normalizedPath = normalizeAndValidatePath(item.path);
    if (paths.has(normalizedPath)) {
      throw new AndroidExportRequestError("duplicate_export_path", "중복된 Android 리소스 경로가 있습니다.");
    }
    paths.add(normalizedPath);

    if ("serverAsset" in item) {
      validatePublicTemplateAssetRef(item.serverAsset);
      continue;
    }

    if (!/^file-\d+$/.test(item.field)) {
      throw new AndroidExportRequestError("invalid_manifest_field", "내보내기 파일 목록이 올바르지 않습니다.");
    }
    // 같은 이미지가 여러 경로로 나갈 때 클라이언트는 field를 공유한다. 바이트는 한 번만 읽는다.
    if (fields.has(item.field)) continue;

    const file = formData.get(item.field);
    if (!(file instanceof File)) {
      throw new AndroidExportRequestError("missing_export_file", `내보내기 파일을 찾을 수 없습니다: ${normalizedPath}`);
    }
    if (file.size > maxAndroidExportFileBytes) {
      throw new AndroidExportRequestError("export_file_too_large", "개별 이미지 파일은 20MB 이하여야 합니다.", 413);
    }

    inputBytes = addInputBytes(inputBytes, file.size);
    fields.add(item.field);
    files.push({ field: item.field, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  return { manifest, files, inputBytes };
}

export function parseManifest(value: string): AndroidExportManifestItem[] {
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

export function addInputBytes(current: number, size: number) {
  const next = current + size;
  if (next > maxExportRequestBytes) {
    throw new AndroidExportRequestError("export_payload_too_large", "내보낼 파일의 전체 크기는 50MB 이하여야 합니다.", 413);
  }
  return next;
}

export function validatePublicTemplateAssetRef(serverAsset: string) {
  if (!serverAsset.startsWith("/template-assets/") || serverAsset.includes("\\")) {
    throw new AndroidExportRequestError("invalid_server_asset", "기본 테마 에셋 참조가 올바르지 않습니다.");
  }

  const relativePath = serverAsset.replace(/^\/+/, "");
  if (relativePath.includes("../") || relativePath.includes("/..") || relativePath === "..") {
    throw new AndroidExportRequestError("invalid_server_asset", "기본 테마 에셋 참조가 올바르지 않습니다.");
  }
}

function isManifestItem(value: unknown): value is AndroidExportManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;
  const hasField = typeof item.field !== "undefined";
  const hasServerAsset = typeof item.serverAsset !== "undefined";
  if (hasField === hasServerAsset) return false;
  if (hasField) return typeof item.field === "string";
  return typeof item.serverAsset === "string";
}

export function normalizeAndValidatePath(value: string) {
  if (!value || value.length > 240 || /[\u0000-\u001f]/.test(value)) {
    throw new AndroidExportRequestError("invalid_export_path", "Android 리소스 경로가 올바르지 않습니다.");
  }

  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.includes("../") || normalized.includes("/..") || normalized === "..") {
    throw new AndroidExportRequestError("invalid_export_path", "Android 리소스 경로가 올바르지 않습니다.");
  }

  if (safeRootFiles.has(normalized)) return normalized;
  const isThemeResource = /^src\/main\/theme\/(?:drawable(?:-[a-z0-9-]+)?|values(?:-[a-z0-9-]+)?)\/[a-z0-9_]+(?:\.9)?\.(?:png|xml)$/.test(normalized);
  const isLauncherResource = /^src\/main\/res\/mipmap-(?:mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)\/ic_launcher(?:_(?:round|background|foreground))?\.png$/.test(normalized);
  const isAllowedResourceRoot = normalized.startsWith("src/main/theme/") || normalized.startsWith("src/main/res/mipmap-");

  if (!isAllowedResourceRoot) {
    throw new AndroidExportRequestError("forbidden_export_path", "Android 테마 리소스 경로만 내보낼 수 있습니다.");
  }
  if (!isThemeResource && !isLauncherResource) {
    throw new AndroidExportRequestError("forbidden_export_file_type", "허용된 Android 테마 및 런처 리소스만 내보낼 수 있습니다.");
  }
  return normalized;
}
