import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { createClient } from "@supabase/supabase-js";
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
import {
  assertCatalogManifestSource,
  createCatalogReader,
  isCatalogManifestItem,
  type CatalogManifestItem,
} from "../../lib/theme/export/catalogSource.js";
import { transformCatalogImage } from "../shared/catalogImageTransform.js";

type BundleManifestItem =
  | { path: string; field: string }
  | { path: string; serverAsset: string }
  | CatalogManifestItem;
type LocalBundle = {
  export_job_id?: string;
  user_id?: string;
  theme_id?: string;
  options?: {
    mode?: string;
    exportName?: string;
    versionName?: string;
    applicationId?: string;
  };
  manifest?: BundleManifestItem[];
};

type BundleOptions = AndroidExportProjectOptions & { exportName: string };
type BuildSource =
  | { mode: "local"; inputDir: string; outputDir: string }
  | { mode: "gcs"; input: GcsObjectRef; inputPrefix: string; output: GcsPrefixRef; exportJobId: string };
type GcsObjectRef = { bucket: string; object: string };
type GcsPrefixRef = { bucket: string; prefix: string };
type BuildResult = { outputFileName: string; apkBytes: Uint8Array };
type ResultJson =
  | { status: "success"; export_job_id: string; output_path: string; fileName: string; bytes: number }
  | { status: "failed"; export_job_id?: string; errorCode: string };

const inputDir = process.env.INPUT_DIR ?? "/in";
const outputDir = process.env.OUTPUT_DIR ?? "/out";
const gcsInputUri = process.env.GCS_INPUT_URI ?? process.env.INPUT_GCS_URI;
const gcsOutputUri = process.env.GCS_OUTPUT_URI ?? process.env.OUTPUT_GCS_URI;
const templateAssetsRoot = process.env.TEMPLATE_ASSETS_ROOT ?? "/workspace/public/template-assets";
const storage = new Storage();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type ExportStage = "preparing" | "building" | "finalizing";
type DbClient = ReturnType<typeof createClient>;

function getDbClientOrNull(): DbClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 3.5 소유권 검증: 번들의 export_job_id/user_id가 DB export_jobs row와 일치해야 한다.
async function verifyOwnership(db: DbClient, exportJobId: string, userId: string) {
  const { data, error } = await db.from("export_jobs").select("user_id,platform").eq("id", exportJobId).maybeSingle();
  if (error) throw new Error("ownership_check_failed");
  if (!data) throw new Error("export_job_not_found");
  const row = data as { user_id?: string; platform?: string };
  if (row.user_id !== userId || row.platform !== "android") throw new Error("ownership_mismatch");
}

// 3.6 스테이지 갱신: status='pending'일 때만(멱등). 실패해도 빌드를 막지 않는다(best-effort).
async function setStage(db: DbClient | null, exportJobId: string | undefined, stage: ExportStage) {
  if (!db || !exportJobId) return;
  try {
    // 빌더에는 생성된 DB 스키마 타입이 없어 update 페이로드가 never로 추론된다. 런타임엔 영향 없음.
    await db.from("export_jobs").update({ stage } as never).eq("id", exportJobId).eq("status", "pending");
  } catch {
    log("info", "stage_update_skipped", { stage });
  }
}

try {
  await main();
} catch (error) {
  log("error", "failed", { errorCode: getErrorCode(error) });
  process.exitCode = 1;
}

async function main() {
  const source = await resolveBuildSource();
  const exportJobId = "exportJobId" in source ? source.exportJobId : undefined;
  log("info", "started", { mode: source.mode, export_job_id: exportJobId });

  const bundle = await readBundle(source);
  const db = getDbClientOrNull();
  if (source.mode === "gcs" && db && bundle.user_id) {
    await verifyOwnership(db, source.exportJobId, bundle.user_id);
  }
  const options = readOptions(bundle);

  try {
    await setStage(db, exportJobId, "preparing");
    const files = await readInputFiles(bundle, source, templateAssetsRoot);
    await setStage(db, exportJobId, "building");
    const result = await buildApk(files, options);
    await setStage(db, exportJobId, "finalizing");
    await writeOutput(source, result);
    log("info", "completed", { mode: source.mode, outputFileName: result.outputFileName });
  } catch (error) {
    await writeFailureResult(source, error);
    throw error;
  }
}

async function buildApk(files: AndroidBuildInputFile[], options: BundleOptions): Promise<BuildResult> {
  const prepared = await prepareAndroidProject(files, options);

  try {
    log("info", "building", { fileCount: files.length, mode: "apk" });
    await writeAndroidLocalProperties(prepared.projectRoot);
    await runGradle(prepared.projectRoot, ["assembleDebug", "--console=plain", "--offline"]);

    const apkPath = await findLatestApk(path.join(prepared.projectRoot, "build", "outputs", "apk"));
    if (!apkPath) throw new Error("APK output was not found.");

    const outputFileName = `${buildExportBaseName(options.exportName)}.apk`;
    const apk = await readFile(apkPath);
    return { outputFileName, apkBytes: new Uint8Array(apk) };
  } finally {
    await prepared.cleanup();
  }
}

async function readBundle(source: BuildSource): Promise<LocalBundle> {
  const raw = source.mode === "gcs" ? await downloadText(source.input) : await readFile(path.join(source.inputDir, "bundle.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isLocalBundle(parsed)) throw new Error("Invalid bundle.json.");
  if (source.mode === "gcs") validateGcsBundle(parsed, source.exportJobId);
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

async function readInputFiles(bundle: LocalBundle, source: BuildSource, assetsRoot: string): Promise<AndroidBuildInputFile[]> {
  const manifest = bundle.manifest ?? [];
  const files: AndroidBuildInputFile[] = [];
  const paths = new Set<string>();
  // 하나의 입력 파일을 여러 경로가 공유할 수 있다(스케일 타깃). 소스당 한 번만 읽는다.
  const bytesBySource = new Map<string, Uint8Array>();
  const readCatalogObject = await createCatalogReader({
    download: ({ objectKey, generation }) => downloadCatalogObject(objectKey, generation),
    sha256Hex: (bytes) => createHash("sha256").update(bytes).digest("hex"),
  });

  for (const item of manifest) {
    const normalizedPath = normalizeExportPath(item.path);
    if (paths.has(normalizedPath)) throw new Error(`Duplicate export path: ${normalizedPath}`);
    paths.add(normalizedPath);

    if ("catalogObject" in item) {
      // Worker가 이미 걸렀지만 여기서 다시 본다. 신뢰 경계는 프로세스마다 다시 긋는다.
      assertCatalogManifestSource({ platform: "android", path: normalizedPath, ref: item.catalogObject, transform: item.transform });
      // catalog reader가 자체 캐시를 갖는다. generation과 SHA-256 대조도 그 안에서 한다.
      const catalogBytes = await readCatalogObject(item.catalogObject);
      const bytes = item.transform
        ? await transformCatalogImage(catalogBytes, {
            fileName: item.catalogObject.fileName!,
            sourceScale: item.catalogObject.sourceScale as 1 | 2 | 3,
            width: item.catalogObject.width!,
            height: item.catalogObject.height!,
          }, item.transform)
        : catalogBytes;
      files.push({ path: normalizedPath, bytes });
      continue;
    }

    if ("serverAsset" in item) {
      const cacheKey = `asset:${item.serverAsset}`;
      const bytes = bytesBySource.get(cacheKey) ?? new Uint8Array(await readFile(resolveTemplateAssetPath(assetsRoot, item.serverAsset)));
      bytesBySource.set(cacheKey, bytes);
      files.push({ path: normalizedPath, bytes });
      continue;
    }

    const cacheKey = `field:${item.field}`;
    const bytes =
      bytesBySource.get(cacheKey) ??
      (source.mode === "gcs" ? await downloadBytes(resolveGcsInputFile(source, item.field)) : new Uint8Array(await readFile(resolveInputFilePath(source.inputDir, item.field))));
    bytesBySource.set(cacheKey, bytes);
    files.push({ path: normalizedPath, bytes });
  }

  return files;
}

function isLocalBundle(value: unknown): value is LocalBundle {
  if (typeof value !== "object" || value === null) return false;
  const bundle = value as Record<string, unknown>;
  if (bundle.export_job_id !== undefined && typeof bundle.export_job_id !== "string") return false;
  if (bundle.user_id !== undefined && typeof bundle.user_id !== "string") return false;
  if (bundle.theme_id !== undefined && typeof bundle.theme_id !== "string") return false;
  if (bundle.options !== undefined && (typeof bundle.options !== "object" || bundle.options === null)) return false;
  if (bundle.manifest !== undefined && !Array.isArray(bundle.manifest)) return false;
  return (bundle.manifest ?? []).every(isManifestItem);
}

function isManifestItem(value: unknown): value is BundleManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;

  // source는 정확히 하나여야 한다. 둘 이상이면 어느 것을 쓸지 모호해지고, 없으면 읽을 것이 없다.
  const sources = [item.field, item.serverAsset, item.catalogObject].filter((value) => typeof value !== "undefined");
  if (sources.length !== 1) return false;

  if (typeof item.catalogObject !== "undefined") return isCatalogManifestItem(item);
  if (typeof item.field !== "undefined") return typeof item.field === "string";
  return typeof item.serverAsset === "string";
}

function resolveInputFilePath(root: string, field: string) {
  const relativePath = normalizeInputFileField(field);
  if (!relativePath || isUnsafeRelativePath(relativePath)) throw new Error(`Invalid input file field: ${field}`);
  return resolveInside(path.join(root, "files"), relativePath);
}

function resolveGcsInputFile(source: Extract<BuildSource, { mode: "gcs" }>, field: string): GcsObjectRef {
  const relativePath = normalizeInputFileField(field);
  if (!relativePath || isUnsafeRelativePath(relativePath)) throw new Error(`Invalid input file field: ${field}`);
  return {
    bucket: source.input.bucket,
    object: joinGcsPath(source.inputPrefix, "files", relativePath),
  };
}

function normalizeInputFileField(field: string) {
  const normalized = field.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized.startsWith("files/") ? normalized.slice("files/".length) : normalized;
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

async function resolveBuildSource(): Promise<BuildSource> {
  if (!gcsInputUri && !gcsOutputUri) return { mode: "local", inputDir, outputDir };
  if (!gcsInputUri || !gcsOutputUri) throw new Error("Both GCS_INPUT_URI and GCS_OUTPUT_URI are required for GCS mode.");

  const input = parseGcsObjectUri(gcsInputUri);
  const inputPrefix = input.object.endsWith("/bundle.json") ? input.object.slice(0, -"bundle.json".length).replace(/\/$/, "") : input.object.replace(/\/$/, "");
  const bundleObject = input.object.endsWith("/bundle.json") ? input.object : joinGcsPath(inputPrefix, "bundle.json");
  const inputBundle = { bucket: input.bucket, object: bundleObject };

  const bundle = await readJsonFromGcs(inputBundle);
  if (!isLocalBundle(bundle)) throw new Error("Invalid bundle.json.");
  const exportJobId = nonEmptyString(bundle.export_job_id);
  if (!exportJobId) throw new Error("GCS bundle requires export_job_id.");
  if (inputPrefix !== exportJobId && !inputPrefix.endsWith(`/${exportJobId}`)) {
    throw new Error("GCS input prefix must end with export_job_id.");
  }

  return {
    mode: "gcs",
    input: inputBundle,
    inputPrefix,
    output: resolveOutputPrefix(gcsOutputUri, exportJobId),
    exportJobId,
  };
}

async function writeOutput(source: BuildSource, result: BuildResult) {
  if (source.mode === "local") {
    await mkdir(source.outputDir, { recursive: true });
    await writeFile(path.join(source.outputDir, result.outputFileName), result.apkBytes);
    return;
  }

  const outputObject = joinGcsPath(source.output.prefix, result.outputFileName);
  await storage.bucket(source.output.bucket).file(outputObject).save(Buffer.from(result.apkBytes), {
    resumable: false,
    contentType: "application/vnd.android.package-archive",
  });

  const resultJson: ResultJson = {
    status: "success",
    export_job_id: source.exportJobId,
    output_path: `gs://${source.output.bucket}/${outputObject}`,
    fileName: result.outputFileName,
    bytes: result.apkBytes.byteLength,
  };
  await uploadJson(source.output, "result.json", resultJson);
}

async function writeFailureResult(source: BuildSource, error: unknown) {
  if (source.mode !== "gcs") return;
  const resultJson: ResultJson = {
    status: "failed",
    export_job_id: source.exportJobId,
    errorCode: getErrorCode(error),
  };
  await uploadJson(source.output, "result.json", resultJson).catch(() => undefined);
}

function validateGcsBundle(bundle: LocalBundle, exportJobId: string) {
  if (bundle.export_job_id !== exportJobId) throw new Error("GCS bundle export_job_id does not match input path.");
  if (!nonEmptyString(bundle.user_id)) throw new Error("GCS bundle requires user_id.");
  if (!nonEmptyString(bundle.theme_id)) throw new Error("GCS bundle requires theme_id.");
  if (!Array.isArray(bundle.manifest)) throw new Error("GCS bundle requires manifest.");
}

async function readJsonFromGcs(ref: GcsObjectRef): Promise<unknown> {
  const raw = await downloadText(ref);
  return JSON.parse(raw);
}

async function downloadText(ref: GcsObjectRef) {
  const [bytes] = await storage.bucket(ref.bucket).file(ref.object).download();
  return bytes.toString("utf8");
}

async function downloadBytes(ref: GcsObjectRef) {
  const [bytes] = await storage.bucket(ref.bucket).file(ref.object).download();
  return new Uint8Array(bytes);
}

/**
 * catalog 객체를 `generation`을 고정해 읽는다.
 *
 * generation을 지정하지 않으면 "지금 그 키에 있는 것"을 받는다. Worker가 manifest를 만든 뒤
 * 객체가 교체되면 다른 그림이 결과물에 들어갈 수 있다. 버킷은 환경변수로 고정하고 manifest에서
 * 받지 않는다.
 */
async function downloadCatalogObject(objectKey: string, generation: string) {
  const bucket = process.env.GCP_THEME_ASSET_BUCKET?.trim();
  if (!bucket) throw new Error("GCP_THEME_ASSET_BUCKET is not configured.");
  const [bytes] = await storage.bucket(bucket).file(objectKey, { generation }).download();
  return new Uint8Array(bytes);
}

async function uploadJson(prefix: GcsPrefixRef, fileName: string, value: ResultJson) {
  await storage.bucket(prefix.bucket).file(joinGcsPath(prefix.prefix, fileName)).save(JSON.stringify(value, null, 2), {
    contentType: "application/json",
    resumable: false,
  });
}

function parseGcsObjectUri(uri: string): GcsObjectRef {
  if (!uri.startsWith("gs://")) throw new Error("GCS URI must start with gs://.");
  const withoutScheme = uri.slice("gs://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0 || slash === withoutScheme.length - 1) throw new Error("GCS URI must include a bucket and object path.");
  const bucket = withoutScheme.slice(0, slash);
  const object = normalizeGcsObjectPath(withoutScheme.slice(slash + 1));
  return { bucket, object };
}

function resolveOutputPrefix(uri: string, exportJobId: string): GcsPrefixRef {
  if (!uri.startsWith("gs://")) throw new Error("GCS URI must start with gs://.");
  const withoutScheme = uri.slice("gs://".length).replace(/\/+$/, "");
  const slash = withoutScheme.indexOf("/");
  if (slash === -1) {
    if (!withoutScheme) throw new Error("GCS URI must include a bucket.");
    return { bucket: withoutScheme, prefix: exportJobId };
  }
  const bucket = withoutScheme.slice(0, slash);
  const rawPrefix = withoutScheme.slice(slash + 1);
  const prefix = rawPrefix ? normalizeGcsObjectPath(rawPrefix) : exportJobId;
  if (!bucket) throw new Error("GCS URI must include a bucket.");
  return { bucket, prefix };
}

function normalizeGcsObjectPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || isUnsafeRelativePath(normalized)) throw new Error(`Invalid GCS object path: ${value}`);
  return normalized;
}

function joinGcsPath(...parts: string[]) {
  return parts
    .map((part) => part.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof Error) return error.name || "error";
  return "error";
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ event, ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) }));
}
