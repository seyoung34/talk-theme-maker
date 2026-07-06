import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildExportBaseName,
  findLatestApk,
  prepareAndroidProject,
  runGradle,
  validateAndroidApplicationId,
  validateAndroidVersionName,
  writeAndroidLocalProperties,
  type AndroidBuildInputFile,
  type AndroidExportProjectOptions,
} from "../../lib/theme/android/buildCore.js";

type BundleManifestItem = { path: string; field: string } | { path: string; serverAsset: string };
type LocalBundle = {
  options?: {
    mode?: string;
    exportName?: string;
    versionName?: string;
    applicationId?: string;
  };
  manifest?: BundleManifestItem[];
};

const inputDir = process.env.INPUT_DIR ?? "/in";
const outputDir = process.env.OUTPUT_DIR ?? "/out";
const templateAssetsRoot = process.env.TEMPLATE_ASSETS_ROOT ?? "/workspace/public/template-assets";

try {
  await main();
} catch (error) {
  log("error", "failed", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}

async function main() {
  log("info", "started", { inputDir, outputDir });
  const bundle = await readBundle(path.join(inputDir, "bundle.json"));
  const options = readOptions(bundle);
  const files = await readInputFiles(bundle, inputDir, templateAssetsRoot);
  const prepared = await prepareAndroidProject(files, options);

  try {
    log("info", "building", { fileCount: files.length, mode: "apk" });
    await writeAndroidLocalProperties(prepared.projectRoot);
    await runGradle(prepared.projectRoot, ["assembleDebug", "--console=plain", "--offline"]);

    const apkPath = await findLatestApk(path.join(prepared.projectRoot, "build", "outputs", "apk"));
    if (!apkPath) throw new Error("APK output was not found.");

    await mkdir(outputDir, { recursive: true });
    const outputFileName = `${buildExportBaseName(options.exportName, options.versionName)}.apk`;
    const outputPath = path.join(outputDir, outputFileName);
    await copyFile(apkPath, outputPath);
    log("info", "completed", { outputFileName });
  } finally {
    await prepared.cleanup();
  }
}

async function readBundle(bundlePath: string): Promise<LocalBundle> {
  const raw = await readFile(bundlePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isLocalBundle(parsed)) throw new Error("Invalid bundle.json.");
  return parsed;
}

function readOptions(bundle: LocalBundle): AndroidExportProjectOptions & { exportName: string } {
  const mode = bundle.options?.mode ?? "apk";
  if (mode !== "apk") throw new Error(`Unsupported local builder mode: ${mode}`);

  const versionName = nonEmptyString(bundle.options?.versionName);
  const applicationId = nonEmptyString(bundle.options?.applicationId);
  if (versionName) validateAndroidVersionName(versionName);
  if (applicationId) validateAndroidApplicationId(applicationId);

  return {
    exportName: nonEmptyString(bundle.options?.exportName) ?? "kakaotalk-theme",
    versionName,
    applicationId,
  };
}

async function readInputFiles(bundle: LocalBundle, root: string, assetsRoot: string): Promise<AndroidBuildInputFile[]> {
  const manifest = bundle.manifest ?? [];
  const files: AndroidBuildInputFile[] = [];
  const paths = new Set<string>();

  for (const item of manifest) {
    const normalizedPath = normalizeExportPath(item.path);
    if (paths.has(normalizedPath)) throw new Error(`Duplicate export path: ${normalizedPath}`);
    paths.add(normalizedPath);

    if ("serverAsset" in item) {
      files.push({ path: normalizedPath, bytes: new Uint8Array(await readFile(resolveTemplateAssetPath(assetsRoot, item.serverAsset))) });
      continue;
    }

    files.push({ path: normalizedPath, bytes: new Uint8Array(await readFile(resolveInputFilePath(root, item.field))) });
  }

  return files;
}

function isLocalBundle(value: unknown): value is LocalBundle {
  if (typeof value !== "object" || value === null) return false;
  const bundle = value as Record<string, unknown>;
  if (bundle.options !== undefined && (typeof bundle.options !== "object" || bundle.options === null)) return false;
  if (bundle.manifest !== undefined && !Array.isArray(bundle.manifest)) return false;
  return (bundle.manifest ?? []).every(isManifestItem);
}

function isManifestItem(value: unknown): value is BundleManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;
  const hasField = typeof item.field !== "undefined";
  const hasServerAsset = typeof item.serverAsset !== "undefined";
  if (hasField === hasServerAsset) return false;
  return hasField ? typeof item.field === "string" : typeof item.serverAsset === "string";
}

function resolveInputFilePath(root: string, field: string) {
  const normalized = field.replaceAll("\\", "/").replace(/^\/+/, "");
  const relativePath = normalized.startsWith("files/") ? normalized.slice("files/".length) : normalized;
  if (!relativePath || isUnsafeRelativePath(relativePath)) throw new Error(`Invalid input file field: ${field}`);
  return resolveInside(path.join(root, "files"), relativePath);
}

function resolveTemplateAssetPath(root: string, serverAsset: string) {
  if (!serverAsset.startsWith("/template-assets/") || serverAsset.includes("\\")) {
    throw new Error(`Invalid serverAsset: ${serverAsset}`);
  }

  const relativePath = serverAsset.slice("/template-assets/".length);
  if (!relativePath || isUnsafeRelativePath(relativePath)) throw new Error(`Invalid serverAsset: ${serverAsset}`);
  return resolveInside(root, relativePath);
}

function normalizeExportPath(value: string) {
  if (!value || value.length > 240 || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid export path: ${value}`);
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || isUnsafeRelativePath(normalized)) throw new Error(`Invalid export path: ${value}`);
  return normalized;
}

function isUnsafeRelativePath(value: string) {
  return path.isAbsolute(value) || value.includes("../") || value.includes("/..") || value === "..";
}

function resolveInside(root: string, relativePath: string) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Path escapes root: ${relativePath}`);
  }
  return absolutePath;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ event, ...details }));
}
