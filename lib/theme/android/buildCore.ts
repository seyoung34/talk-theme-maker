import { spawn, type ChildProcess } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const sampleProjectRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "android-sample-theme", "apeach-26.1.0-source");
const gradleTimeoutMs = 4 * 60 * 1000;
const gradleLogTailBytes = 24 * 1024;

export type AndroidBuildInputFile = {
  path: string;
  bytes: Uint8Array;
};

export type AndroidExportProjectOptions = {
  versionName?: string;
  applicationId?: string;
};

export type AndroidBuildStage = "preparing" | "building" | "packaging" | "finalizing";
export type AndroidBuildHooks = { onStage?: (stage: AndroidBuildStage) => void | Promise<void>; signal?: AbortSignal };

export class AndroidBuildError extends Error {
  constructor(
    public readonly code: string,
    public readonly clientMessage: string,
    public readonly logTail?: string,
  ) {
    super(clientMessage);
    this.name = "AndroidBuildError";
  }
}

export async function buildAndroidApk(
  files: AndroidBuildInputFile[],
  apkBaseName: string,
  options: AndroidExportProjectOptions = {},
  hooks: AndroidBuildHooks = {},
) {
  await notifyStage(hooks, "preparing");
  const prepared = await prepareAndroidProject(files, options);

  try {
    await notifyStage(hooks, "building");
    await writeAndroidLocalProperties(prepared.projectRoot);
    await runGradle(prepared.projectRoot, ["assembleDebug", "--console=plain"], hooks.signal);

    await notifyStage(hooks, "finalizing");
    const apkPath = await findLatestApk(path.join(prepared.projectRoot, "build", "outputs", "apk"));
    if (!apkPath) {
      throw new AndroidBuildError("apk_output_not_found", "APK 결과물을 찾지 못했습니다.");
    }

    return {
      apkBytes: await readFile(/* turbopackIgnore: true */ apkPath),
      fileName: `${buildExportBaseName(apkBaseName, options.versionName)}.apk`,
    };
  } finally {
    await prepared.cleanup();
  }
}

export async function getAndroidSampleVersionName() {
  const buildScript = await readFile(path.join(sampleProjectRoot, "build.gradle.kts"), "utf8");
  const match = buildScript.match(/versionName\s*=\s*"([^"]+)"/);
  return match?.[1] ?? "1.0.0";
}

export async function prepareAndroidProject(files: AndroidBuildInputFile[], options: AndroidExportProjectOptions) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "kt-theme-apk-"));
  const projectRoot = path.join(tempRoot, "project");

  try {
    await cp(/* turbopackIgnore: true */ sampleProjectRoot, projectRoot, { recursive: true, filter: shouldCopySampleEntry });
    await removeBundledOptionalDrawables(projectRoot);
    if (options.applicationId?.trim()) {
      await writeProjectApplicationId(projectRoot, options.applicationId.trim());
    }
    if (options.versionName?.trim()) {
      await writeProjectVersion(projectRoot, options.versionName.trim());
    }

    for (const file of files) {
      const targetPath = ensureInsideProject(projectRoot, file.path);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.bytes);
    }
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    projectRoot,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  };
}

export async function writeAndroidLocalProperties(projectRoot: string) {
  const sdkDir = await resolveAndroidSdkDir();
  if (!sdkDir) {
    throw new AndroidBuildError(
      "android_sdk_missing",
      "Android APK 빌드 환경에 Android SDK가 없습니다. 서버에 Android SDK를 설치하고 ANDROID_HOME 또는 ANDROID_SDK_ROOT를 설정해 주세요.",
    );
  }

  const escaped = sdkDir.replaceAll("\\", "\\\\");
  await writeFile(path.join(projectRoot, "local.properties"), `sdk.dir=${escaped}\n`, "utf8");
}

export function runGradle(projectRoot: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AndroidBuildError("build_cancelled", "Android 빌드 요청이 취소되었습니다."));
      return;
    }
    const command = process.platform === "win32" ? "cmd.exe" : "sh";
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "gradlew.bat", ...args] : ["gradlew", ...args];
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    let logTail = "";
    let didTimeOut = false;
    let wasCancelled = false;
    const abortHandler = () => {
      wasCancelled = true;
      terminateProcessTree(child);
    };
    signal?.addEventListener("abort", abortHandler, { once: true });
    const timeout = setTimeout(() => {
      didTimeOut = true;
      terminateProcessTree(child);
    }, gradleTimeoutMs);

    child.stdout.on("data", (chunk) => {
      logTail = appendLogTail(logTail, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      logTail = appendLogTail(logTail, chunk.toString());
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortHandler);
      reject(new AndroidBuildError("gradle_process_error", "Android 빌드 프로세스를 시작하지 못했습니다.", error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortHandler);
      if (wasCancelled) {
        reject(new AndroidBuildError("build_cancelled", "Android 빌드 요청이 취소되었습니다.", logTail));
        return;
      }
      if (didTimeOut) {
        reject(new AndroidBuildError("gradle_timeout", "Android 빌드 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", logTail));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new AndroidBuildError("gradle_build_failed", "Android APK 빌드에 실패했습니다.", `exit=${code}\n${logTail}`.trim()));
    });
  });
}

export async function findLatestApk(root: string): Promise<string | null> {
  try {
    const found = await walkForApks(root);
    if (found.length === 0) return null;
    found.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return found[0].filePath;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

export function buildExportBaseName(name: string, versionName?: string) {
  const safeName = sanitizeFileNamePart(name, "kakaotalk-theme");
  const safeVersion = sanitizeFileNamePart(versionName ?? "1.0.0", "1.0.0");
  return `${safeName}_${safeVersion}`;
}

export function validateAndroidApplicationId(value: string) {
  if (!/^[a-z0-9_.]+$/.test(value)) {
    throw new AndroidBuildError("invalid_application_id", "applicationId 형식이 올바르지 않습니다.");
  }

  const segments = value.split(".");
  if (segments.length < 2) {
    throw new AndroidBuildError("invalid_application_id", "applicationId는 두 개 이상의 패키지 구간이 필요합니다.");
  }

  for (const segment of segments) {
    if (!segment || !/^[a-z_][a-z0-9_]*$/.test(segment) || androidPackageSegmentReservedWords.has(segment)) {
      throw new AndroidBuildError("invalid_application_id", `applicationId 구간이 올바르지 않습니다: ${segment || "(비어 있음)"}`);
    }
  }
}

export function validateAndroidVersionName(value: string) {
  if (value.length > 40 || !/^\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    throw new AndroidBuildError("invalid_version_name", "versionName은 숫자와 점을 사용한 버전 형식이어야 합니다.");
  }
}

function shouldCopySampleEntry(source: string) {
  const relativePath = path.relative(sampleProjectRoot, source).replaceAll("\\", "/");
  if (!relativePath) return true;
  const firstSegment = relativePath.split("/", 1)[0];
  if (firstSegment === ".gradle" || firstSegment === "build") return false;
  if (relativePath === "local.properties") return false;
  if (/\.(?:apk|aab)$/i.test(relativePath)) return false;
  return true;
}

async function removeBundledOptionalDrawables(projectRoot: string) {
  const bundledPaths = [
    "src/main/theme/drawable-sw600dp/theme_maintab_cell_image.9.png",
    "src/main/theme/drawable-xxhdpi/theme_maintab_cell_image.9.png",
    "src/main/theme/drawable-sw600dp/theme_background_image.png",
    "src/main/theme/drawable-xxhdpi/theme_background_image.png",
    "src/main/theme/drawable-sw600dp/theme_chatroom_background_image.png",
    "src/main/theme/drawable-xxhdpi/theme_chatroom_background_image.png",
    "src/main/theme/drawable-sw600dp/theme_passcode_background_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_background_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_01_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_01_checked_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_02_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_02_checked_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_03_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_03_checked_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_04_image.png",
    "src/main/theme/drawable-xxhdpi/theme_passcode_04_checked_image.png",
  ];

  await Promise.all(
    bundledPaths.map((relativePath) =>
      rm(path.join(projectRoot, relativePath), {
        force: true,
      }),
    ),
  );
}

async function writeProjectApplicationId(projectRoot: string, applicationId: string) {
  validateAndroidApplicationId(applicationId);

  const buildScriptPath = path.join(projectRoot, "build.gradle.kts");
  const buildScript = await readFile(/* turbopackIgnore: true */ buildScriptPath, "utf8");
  const nextBuildScript = buildScript.replace(/applicationId\s*=\s*"([^"]+)"/, `applicationId = "${applicationId}"`);
  if (nextBuildScript === buildScript) {
    throw new Error("Android applicationId field was not found in build.gradle.kts.");
  }
  await writeFile(buildScriptPath, nextBuildScript, "utf8");
}

async function writeProjectVersion(projectRoot: string, versionName: string) {
  validateAndroidVersionName(versionName);
  const buildScriptPath = path.join(projectRoot, "build.gradle.kts");
  const current = await readFile(/* turbopackIgnore: true */ buildScriptPath, "utf8");
  const next = current
    .replace(/versionName\s*=\s*"([^"]+)"/, `versionName = "${versionName.replaceAll('"', '\\"')}"`)
    .replace(/versionCode\s*=\s*\d+/, `versionCode = ${buildVersionCode(versionName)}`);
  if (next === current) {
    throw new AndroidBuildError("version_config_not_found", "Android 버전 설정을 적용하지 못했습니다.");
  }
  await writeFile(buildScriptPath, next, "utf8");
}

async function resolveAndroidSdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function ensureInsideProject(projectRoot: string, relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const absolute = path.resolve(projectRoot, normalized);
  const rootWithSep = `${path.resolve(projectRoot)}${path.sep}`;
  if (absolute !== path.resolve(projectRoot) && !absolute.startsWith(rootWithSep)) {
    throw new Error(`Invalid export path: ${relativePath}`);
  }
  return absolute;
}

async function walkForApks(root: string): Promise<Array<{ filePath: string; mtimeMs: number }>> {
  const entries = await readdir(/* turbopackIgnore: true */ root, { withFileTypes: true });
  const results: Array<{ filePath: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkForApks(fullPath)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".apk")) continue;
    const fileStat = await stat(/* turbopackIgnore: true */ fullPath);
    results.push({ filePath: fullPath, mtimeMs: fileStat.mtimeMs });
  }

  return results;
}

function buildVersionCode(versionName: string) {
  const parts = versionName
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D+/g, ""), 10))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 0) return 10000;

  const [major = 1, minor = 0, patch = 0] = parts;
  return Math.min(2_100_000_000, Math.max(1, major * 10000 + minor * 100 + patch));
}

async function notifyStage(hooks: AndroidBuildHooks, stage: AndroidBuildStage) {
  await hooks.onStage?.(stage);
}

function appendLogTail(current: string, chunk: string) {
  const next = current + chunk;
  return next.length > gradleLogTailBytes ? next.slice(-gradleLogTailBytes) : next;
}

function terminateProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    killer.unref();
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 5000).unref();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sanitizeFileNamePart(value: string, fallback: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || fallback;
}

const androidPackageSegmentReservedWords = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "goto",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
]);
