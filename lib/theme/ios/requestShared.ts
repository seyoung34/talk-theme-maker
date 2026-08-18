import { getExportRequestTooLargePayload, maxExportRequestBytes } from "@/lib/theme/exportRequest";
import { IosExportRequestError, normalizeIosPath, type IosPackageEntry, validateIosPackage } from "@/lib/theme/ios/packageValidation";

type UploadManifestItem = { field: string; path: string };
type ServerAssetManifestItem = { path: string; serverAsset: string };
export type IosManifestItem = UploadManifestItem | ServerAssetManifestItem;

const maxIosExportFiles = 300;

export async function readIosEntries(formData: FormData, manifestRaw: string, requestUrl: string) {
  const parsed = parseIosManifest(manifestRaw);
  const fields = new Set<string>();
  const paths = new Set<string>();
  const entries: IosPackageEntry[] = [];
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

export function parseIosManifest(value: string): IosManifestItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new IosExportRequestError("invalid_manifest_json", "내보내기 파일 목록을 읽지 못했습니다.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > maxIosExportFiles) {
    throw new IosExportRequestError("invalid_manifest", "iOS 내보내기 파일 목록이 올바르지 않습니다.");
  }
  if (!parsed.every(isManifestItem)) {
    throw new IosExportRequestError("invalid_manifest", "내보내기 파일 목록이 올바르지 않습니다.");
  }
  return parsed;
}

export function addIosInputBytes(current: number, size: number) {
  const next = current + size;
  if (next > maxExportRequestBytes) {
    throw new IosExportRequestError("export_payload_too_large", getExportRequestTooLargePayload().error, 413);
  }
  return next;
}

export async function readIosFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    throw new IosExportRequestError("invalid_form_data", "업로드 데이터를 읽지 못했습니다. 파일 크기를 확인한 후 다시 시도해 주세요.");
  }
}

export function isIosExportMode(value: FormDataEntryValue | null): value is "theme-zip" | "ktheme" {
  return value === "theme-zip" || value === "ktheme";
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
  return addIosInputBytes(current, size);
}
