import { mkdtemp, cp, mkdir, writeFile, readFile, rm, readdir, stat, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const sampleProjectRoot = path.resolve("android-sample-theme", "apeach-26.1.0-source");

export type AndroidBuildInputFile = {
  path: string;
  bytes: Uint8Array;
};

export async function buildAndroidApk(files: AndroidBuildInputFile[], apkBaseName: string) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "kt-theme-apk-"));
  const projectRoot = path.join(tempRoot, "project");

  try {
    await cp(sampleProjectRoot, projectRoot, { recursive: true });
    await writeAndroidLocalProperties(projectRoot);

    for (const file of files) {
      const targetPath = ensureInsideProject(projectRoot, file.path);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.bytes);
    }

    await runGradle(projectRoot, ["assembleDebug"]);

    const apkPath = await findLatestApk(path.join(projectRoot, "build", "outputs", "apk"));
    if (!apkPath) {
      throw new Error("APK output was not found after Gradle build.");
    }

    return {
      apkBytes: await readFile(apkPath),
      fileName: `${sanitizeFileName(apkBaseName)}-android-debug.apk`,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeAndroidLocalProperties(projectRoot: string) {
  const sdkDir = await resolveAndroidSdkDir();
  if (!sdkDir) {
    throw new Error("Android SDK was not found. Set ANDROID_HOME or install the SDK under %LOCALAPPDATA%\\Android\\Sdk.");
  }

  const escaped = sdkDir.replaceAll("\\", "\\\\");
  await writeFile(path.join(projectRoot, "local.properties"), `sdk.dir=${escaped}\n`, "utf8");
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

function runGradle(projectRoot: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "./gradlew";
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "gradlew.bat", ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Gradle build failed with exit code ${code}.\n${stdout}\n${stderr}`.trim()));
    });
  });
}

async function findLatestApk(root: string): Promise<string | null> {
  try {
    const found = await walkForApks(root);
    if (found.length === 0) return null;
    found.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return found[0].filePath;
  } catch {
    return null;
  }
}

async function walkForApks(root: string): Promise<Array<{ filePath: string; mtimeMs: number }>> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: Array<{ filePath: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkForApks(fullPath)));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".apk")) continue;
    const fileStat = await stat(fullPath);
    results.push({ filePath: fullPath, mtimeMs: fileStat.mtimeMs });
  }

  return results;
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kakaotalk-theme";
}
