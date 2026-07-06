import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  AndroidBuildError,
  buildAndroidApk as buildAndroidApkCore,
  buildExportBaseName,
  prepareAndroidProject,
  type AndroidBuildHooks,
  type AndroidBuildInputFile,
  type AndroidExportProjectOptions,
} from "@/lib/theme/android/buildCore";
import { createStoredZip } from "@/lib/theme/project/zip";

export {
  AndroidBuildError,
  getAndroidSampleVersionName,
  validateAndroidApplicationId,
  validateAndroidVersionName,
} from "@/lib/theme/android/buildCore";
export type { AndroidBuildHooks, AndroidBuildInputFile, AndroidBuildStage, AndroidExportProjectOptions } from "@/lib/theme/android/buildCore";

const maxConcurrentAndroidBuilds = Math.max(1, Math.min(2, Number.parseInt(process.env.ANDROID_BUILD_CONCURRENCY ?? "1", 10) || 1));
let activeAndroidBuilds = 0;

export async function buildAndroidApk(files: AndroidBuildInputFile[], apkBaseName: string, options: AndroidExportProjectOptions = {}, hooks: AndroidBuildHooks = {}) {
  if (activeAndroidBuilds >= maxConcurrentAndroidBuilds) {
    throw new AndroidBuildError("build_capacity_reached", "현재 다른 APK를 빌드하고 있습니다. 잠시 후 다시 시도해 주세요.");
  }
  activeAndroidBuilds += 1;

  try {
    return await buildAndroidApkCore(files, apkBaseName, options, hooks);
  } finally {
    activeAndroidBuilds -= 1;
  }
}

export async function exportAndroidProjectZip(files: AndroidBuildInputFile[], projectBaseName: string, options: AndroidExportProjectOptions = {}, hooks: AndroidBuildHooks = {}) {
  await notifyStage(hooks, "preparing");
  const prepared = await prepareAndroidProject(files, options);

  try {
    await notifyStage(hooks, "packaging");
    const zipBytes = await zipProjectDirectory(prepared.projectRoot);
    return {
      zipBytes,
      fileName: `${buildExportBaseName(projectBaseName, options.versionName)}.zip`,
    };
  } finally {
    await prepared.cleanup();
  }
}

export async function exportAndroidApkZip(files: AndroidBuildInputFile[], apkBaseName: string, options: AndroidExportProjectOptions = {}, hooks: AndroidBuildHooks = {}) {
  const { apkBytes, fileName } = await buildAndroidApk(files, apkBaseName, options, hooks);
  await notifyStage(hooks, "packaging");
  const zipBlob = createStoredZip([{ path: fileName, bytes: apkBytes }]);
  return {
    zipBytes: new Uint8Array(await zipBlob.arrayBuffer()),
    fileName: `${buildExportBaseName(apkBaseName, options.versionName)}.zip`,
  };
}

async function notifyStage(hooks: AndroidBuildHooks, stage: Parameters<NonNullable<AndroidBuildHooks["onStage"]>>[0]) {
  await hooks.onStage?.(stage);
}

async function zipProjectDirectory(projectRoot: string) {
  const entries = await collectZipEntries(projectRoot, projectRoot);
  return new Uint8Array(await createStoredZip(entries).arrayBuffer());
}

async function collectZipEntries(root: string, currentDir: string): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  const dirEntries = await readdir(/* turbopackIgnore: true */ currentDir, { withFileTypes: true });
  const results: Array<{ path: string; bytes: Uint8Array }> = [];

  for (const entry of dirEntries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll("\\", "/");

    if (shouldSkipProjectEntry(relativePath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...(await collectZipEntries(root, fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    results.push({
      path: relativePath,
      bytes: new Uint8Array(await readFile(/* turbopackIgnore: true */ fullPath)),
    });
  }

  return results;
}

function shouldSkipProjectEntry(relativePath: string, isDirectory: boolean) {
  const normalized = relativePath.replaceAll("\\", "/");

  if (normalized === "local.properties") return true;
  if (normalized === ".gradle" || normalized.startsWith(".gradle/")) return true;
  if (normalized === "build" || normalized.startsWith("build/")) return true;
  if (!isDirectory && (normalized.endsWith(".apk") || normalized.endsWith(".aab"))) return true;

  return false;
}
