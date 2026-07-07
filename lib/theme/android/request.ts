import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AndroidBuildInputFile } from "@/lib/theme/android/buildCore";
import {
  addInputBytes,
  AndroidExportRequestError,
  maxAndroidExportFileBytes,
  normalizeAndValidatePath,
  parseManifest,
  readAndroidBundleUpload,
  validatePublicTemplateAssetRef,
  type AndroidBundleUploadFile,
  type AndroidExportManifestItem,
} from "@/lib/theme/android/requestShared";

export { AndroidExportRequestError, readAndroidBundleUpload };
export type { AndroidBundleUploadFile, AndroidExportManifestItem };

export async function readAndroidBuildInputFiles(formData: FormData, manifestRaw: string) {
  const manifest = parseManifest(manifestRaw);
  const fields = new Set<string>();
  const paths = new Set<string>();
  const files: AndroidBuildInputFile[] = [];
  let inputBytes = 0;

  for (const item of manifest) {
    const normalizedPath = normalizeAndValidatePath(item.path);
    if (paths.has(normalizedPath)) {
      throw new AndroidExportRequestError("duplicate_export_path", "중복된 Android 리소스 경로가 있습니다.");
    }

    if ("serverAsset" in item) {
      const bytes = await readPublicTemplateAsset(item.serverAsset);
      inputBytes = addInputBytes(inputBytes, bytes.byteLength);
      paths.add(normalizedPath);
      files.push({ path: normalizedPath, bytes });
      continue;
    }

    if (!/^file-\d+$/.test(item.field) || fields.has(item.field)) {
      throw new AndroidExportRequestError("invalid_manifest_field", "내보내기 파일 목록이 올바르지 않습니다.");
    }

    const file = formData.get(item.field);
    if (!(file instanceof File)) {
      throw new AndroidExportRequestError("missing_export_file", `내보내기 파일을 찾을 수 없습니다: ${item.path}`);
    }
    if (file.size > maxAndroidExportFileBytes) {
      throw new AndroidExportRequestError("export_file_too_large", "개별 이미지 파일은 20MB 이하여야 합니다.", 413);
    }

    inputBytes = addInputBytes(inputBytes, file.size);
    fields.add(item.field);
    paths.add(normalizedPath);
    files.push({ path: normalizedPath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  return { files, inputBytes };
}

async function readPublicTemplateAsset(serverAsset: string) {
  const absolutePath = resolvePublicTemplateAssetPath(serverAsset);
  try {
    const bytes = await readFile(absolutePath);
    if (bytes.byteLength > maxAndroidExportFileBytes) {
      throw new AndroidExportRequestError("export_file_too_large", "개별 이미지 파일은 20MB 이하여야 합니다.", 413);
    }
    return new Uint8Array(bytes);
  } catch (error) {
    if (error instanceof AndroidExportRequestError) throw error;
    throw new AndroidExportRequestError("missing_server_asset", "기본 테마 에셋을 찾지 못했습니다.");
  }
}

function resolvePublicTemplateAssetPath(serverAsset: string) {
  validatePublicTemplateAssetRef(serverAsset);

  const relativePath = serverAsset.replace(/^\/+/, "");
  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const templateAssetsRoot = path.resolve(publicRoot, "template-assets");
  if (absolutePath !== templateAssetsRoot && !absolutePath.startsWith(`${templateAssetsRoot}${path.sep}`)) {
    throw new AndroidExportRequestError("forbidden_server_asset", "허용된 기본 테마 에셋만 참조할 수 있습니다.");
  }
  return absolutePath;
}
