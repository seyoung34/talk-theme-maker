import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { createClient } from "@supabase/supabase-js";
import {
  applyServerThemeIdentifier,
  normalizeIosPath,
  validateIosPackage,
  type IosPackageEntry,
} from "../../lib/theme/ios/packageValidation.js";
import { INPUT_ARCHIVE_FILE_NAME, readInputArchive } from "../../lib/theme/export/inputArchive.js";
import { createStoredZipBytes } from "../../lib/theme/project/zip.js";
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
  options?: {
    mode?: string;
    exportName?: string;
    themeIdentifier?: string;
  };
  manifest?: BundleManifestItem[];
  files_archive?: string;
};
type BuildSource =
  | { mode: "local"; inputDir: string; outputDir: string }
  | { mode: "gcs"; input: GcsObjectRef; inputPrefix: string; output: GcsPrefixRef; exportJobId: string };
type GcsObjectRef = { bucket: string; object: string };
type GcsPrefixRef = { bucket: string; prefix: string };
type BuildResult = { outputFileName: string; contentType: string; zipBytes: Uint8Array };
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
type ExportStage = "preparing" | "packaging" | "finalizing";
type DbClient = ReturnType<typeof createClient>;

function getDbClientOrNull(): DbClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

class BuildCancelledError extends Error {
  readonly code = "build_cancelled";

  constructor() {
    super("Export was cancelled.");
    this.name = "BuildCancelledError";
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
  log("info", "started", { platform: "ios", mode: source.mode, export_job_id: exportJobId });

  const bundle = await readBundle(source);
  const db = getDbClientOrNull();
  if (source.mode === "gcs" && db && bundle.user_id) {
    await verifyOwnership(db, source.exportJobId, bundle.user_id);
  }

  try {
    await assertBuildNotCancelled(db, exportJobId);
    await markBuilderStarted(db, exportJobId);
    await setStage(db, exportJobId, "preparing");
    const options = readOptions(bundle);
    const entries = await readInputEntries(bundle, source, templateAssetsRoot);
    await assertBuildNotCancelled(db, exportJobId);
    const identifiedEntries = applyServerThemeIdentifier(entries, options.themeIdentifier);
    validateIosPackage(identifiedEntries);
    await setStage(db, exportJobId, "packaging");
    await assertBuildNotCancelled(db, exportJobId);
    const result = createZipResult(identifiedEntries, options);
    await assertBuildNotCancelled(db, exportJobId);
    await setStage(db, exportJobId, "finalizing");
    await assertBuildNotCancelled(db, exportJobId);
    await writeOutput(source, result);
    log("info", "completed", {
      platform: "ios",
      export_job_id: exportJobId,
      mode: options.mode,
      inputFileCount: identifiedEntries.length,
      outputBytes: result.zipBytes.byteLength,
      outputFileName: result.outputFileName,
    });
  } catch (error) {
    await writeFailureResult(source, error);
    throw error;
  }
}

async function assertBuildNotCancelled(db: DbClient | null, exportJobId: string | undefined) {
  if (!db || !exportJobId) return;
  const { data, error } = await db
    .from("export_jobs")
    .select("status,cancel_requested_at")
    .eq("id", exportJobId)
    .maybeSingle();
  if (error) throw new Error("cancellation_check_failed");
  const row = data as { status?: string; cancel_requested_at?: string | null } | null;
  if (!row || row.status !== "pending" || row.cancel_requested_at) throw new BuildCancelledError();
}

async function markBuilderStarted(db: DbClient | null, exportJobId: string | undefined) {
  if (!db || !exportJobId) return;
  const now = new Date().toISOString();
  try {
    await db.from("export_jobs").update({
      enqueue_state: "running",
      builder_started_at: now,
      last_heartbeat_at: now,
    } as never).eq("id", exportJobId).eq("status", "pending");
  } catch {
    log("info", "builder_start_update_skipped", { platform: "ios", export_job_id: exportJobId });
  }
}

async function verifyOwnership(db: DbClient, exportJobId: string, userId: string) {
  const { data, error } = await db.from("export_jobs").select("user_id,platform").eq("id", exportJobId).maybeSingle();
  if (error) throw new Error("ownership_check_failed");
  if (!data) throw new Error("export_job_not_found");
  const row = data as { user_id?: string; platform?: string };
  if (row.user_id !== userId) throw new Error("ownership_mismatch");
  if (row.platform !== "ios") throw new Error("ownership_mismatch");
}

async function setStage(db: DbClient | null, exportJobId: string | undefined, stage: ExportStage) {
  if (!db || !exportJobId) return;
  try {
    await db.from("export_jobs").update({ stage } as never).eq("id", exportJobId).eq("status", "pending");
  } catch {
    log("info", "stage_update_skipped", { platform: "ios", export_job_id: exportJobId, stage });
  }
}

function readOptions(bundle: LocalBundle) {
  const mode = bundle.options?.mode;
  if (mode !== "theme-zip" && mode !== "ktheme") throw new Error("unsupported_export_mode");
  const exportName = sanitizeExportName(bundle.options?.exportName ?? "kakaotalk-theme");
  const themeIdentifier = nonEmptyString(bundle.options?.themeIdentifier);
  if (!themeIdentifier) throw new Error("missing_theme_identifier");
  return { mode, exportName, themeIdentifier };
}

function createZipResult(entries: IosPackageEntry[], options: ReturnType<typeof readOptions>): BuildResult {
  const zipBytes = createStoredZipBytes(entries);
  return {
    outputFileName: `${buildExportBaseName(options.exportName)}.${options.mode === "ktheme" ? "ktheme" : "zip"}`,
    contentType: options.mode === "ktheme" ? "application/octet-stream" : "application/zip",
    zipBytes,
  };
}

async function readInputEntries(bundle: LocalBundle, source: BuildSource, assetsRoot: string): Promise<IosPackageEntry[]> {
  const manifest = bundle.manifest ?? [];
  const paths = new Set<string>();
  const bytesBySource = new Map<string, Uint8Array>();
  const readCatalogObject = await createCatalogReader({
    download: ({ objectKey, generation }) => downloadCatalogObject(objectKey, generation),
    sha256Hex: (bytes) => createHash("sha256").update(bytes).digest("hex"),
  });
  const archiveByField =
    source.mode === "gcs" && bundle.files_archive
      ? readInputArchive(await downloadBytes(resolveGcsInputArchive(source)))
      : null;
  const entries: IosPackageEntry[] = [];

  for (const item of manifest) {
    const normalizedPath = normalizeIosPath(item.path);
    if (paths.has(normalizedPath)) throw new Error("duplicate_export_path");
    paths.add(normalizedPath);

    if ("catalogObject" in item) {
      // Worker가 이미 걸렀지만 여기서 다시 본다. 신뢰 경계는 프로세스마다 다시 긋는다.
      assertCatalogManifestSource({ platform: "ios", path: normalizedPath, ref: item.catalogObject, resourceRole: item.resourceRole, transform: item.transform });
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
      entries.push({ path: normalizedPath, bytes });
      continue;
    }

    if ("serverAsset" in item) {
      const cacheKey = `asset:${item.serverAsset}`;
      const bytes = bytesBySource.get(cacheKey) ?? new Uint8Array(await readFile(resolveTemplateAssetPath(assetsRoot, item.serverAsset)));
      bytesBySource.set(cacheKey, bytes);
      entries.push({ path: normalizedPath, bytes });
      continue;
    }

    const field = normalizeInputFileField(item.field);
    if (!field || isUnsafeRelativePath(field)) throw new Error("invalid_manifest_field");
    const cacheKey = `field:${field}`;
    const archivedBytes = archiveByField?.get(field);
    if (archiveByField && !archivedBytes) throw new Error("input_archive_file_missing");
    const bytes =
      bytesBySource.get(cacheKey) ??
      (archivedBytes ?? (source.mode === "gcs"
        ? await downloadBytes(resolveGcsInputFile(source, field))
        : new Uint8Array(await readFile(resolveInputFilePath(source.inputDir, field)))));
    bytesBySource.set(cacheKey, bytes);
    entries.push({ path: normalizedPath, bytes });
  }

  return entries;
}

async function readBundle(source: BuildSource): Promise<LocalBundle> {
  const raw = source.mode === "gcs" ? await downloadText(source.input) : await readFile(path.join(source.inputDir, "bundle.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isLocalBundle(parsed)) throw new Error("invalid_bundle");
  if (source.mode === "gcs") validateGcsBundle(parsed, source.exportJobId);
  return parsed;
}

async function writeOutput(source: BuildSource, result: BuildResult) {
  if (source.mode === "local") {
    await mkdir(source.outputDir, { recursive: true });
    await writeFile(path.join(source.outputDir, result.outputFileName), result.zipBytes);
    return;
  }

  const outputObject = joinGcsPath(source.output.prefix, result.outputFileName);
  await storage.bucket(source.output.bucket).file(outputObject).save(Buffer.from(result.zipBytes), {
    resumable: false,
    contentType: result.contentType,
  });

  const resultJson: ResultJson = {
    status: "success",
    export_job_id: source.exportJobId,
    output_path: `gs://${source.output.bucket}/${outputObject}`,
    fileName: result.outputFileName,
    bytes: result.zipBytes.byteLength,
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
  if (bundle.export_job_id !== exportJobId) throw new Error("bundle_job_mismatch");
  if (!nonEmptyString(bundle.user_id)) throw new Error("missing_user_id");
  if (!Array.isArray(bundle.manifest)) throw new Error("missing_manifest");
  if (bundle.files_archive !== undefined && bundle.files_archive !== INPUT_ARCHIVE_FILE_NAME) {
    throw new Error("invalid_input_archive");
  }
}

function isLocalBundle(value: unknown): value is LocalBundle {
  if (typeof value !== "object" || value === null) return false;
  const bundle = value as Record<string, unknown>;
  if (bundle.export_job_id !== undefined && typeof bundle.export_job_id !== "string") return false;
  if (bundle.user_id !== undefined && typeof bundle.user_id !== "string") return false;
  if (bundle.files_archive !== undefined && typeof bundle.files_archive !== "string") return false;
  if (bundle.options !== undefined && (typeof bundle.options !== "object" || bundle.options === null)) return false;
  if (bundle.manifest !== undefined && !Array.isArray(bundle.manifest)) return false;
  return (bundle.manifest ?? []).every(isManifestItem);
}

function isManifestItem(value: unknown): value is BundleManifestItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.path !== "string") return false;

  // source는 정확히 하나여야 한다. 둘 이상이면 어느 것을 쓸지 모호해지고, 없으면 읽을 것이 없다.
  const sources = [item.field, item.serverAsset, item.catalogObject].filter((source) => typeof source !== "undefined");
  if (sources.length !== 1) return false;

  if (typeof item.catalogObject !== "undefined") return isCatalogManifestItem(item);
  if (typeof item.field !== "undefined") return typeof item.field === "string";
  return typeof item.serverAsset === "string";
}

/**
 * catalog 객체를 `generation`을 고정해 읽는다.
 *
 * generation을 지정하지 않으면 "지금 그 키에 있는 것"을 받는다. Worker가 manifest를 만든 뒤 객체가
 * 교체되면 다른 그림이 결과물에 들어갈 수 있다. 버킷은 환경변수로 고정하고 manifest에서 받지 않는다.
 */
async function downloadCatalogObject(objectKey: string, generation: string) {
  const bucket = process.env.GCP_THEME_ASSET_BUCKET?.trim();
  if (!bucket) throw new Error("GCP_THEME_ASSET_BUCKET is not configured.");
  const [bytes] = await storage.bucket(bucket).file(objectKey, { generation }).download();
  return new Uint8Array(bytes);
}

function resolveInputFilePath(root: string, field: string) {
  return resolveInside(path.join(root, "files"), field);
}

function resolveGcsInputFile(source: Extract<BuildSource, { mode: "gcs" }>, field: string): GcsObjectRef {
  return { bucket: source.input.bucket, object: joinGcsPath(source.inputPrefix, "files", field) };
}

function resolveGcsInputArchive(source: Extract<BuildSource, { mode: "gcs" }>): GcsObjectRef {
  return { bucket: source.input.bucket, object: joinGcsPath(source.inputPrefix, INPUT_ARCHIVE_FILE_NAME) };
}

function normalizeInputFileField(field: string) {
  const normalized = field.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized.startsWith("files/") ? normalized.slice("files/".length) : normalized;
}

function resolveTemplateAssetPath(root: string, serverAsset: string) {
  if (!serverAsset.startsWith("/template-assets/") || serverAsset.includes("\\")) throw new Error("invalid_server_asset");
  const relativePath = serverAsset.slice("/template-assets/".length);
  if (!relativePath || isUnsafeRelativePath(relativePath)) throw new Error("invalid_server_asset");
  return resolveInside(root, relativePath);
}

function resolveInside(root: string, relativePath: string) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error("path_escape");
  return absolutePath;
}

function isUnsafeRelativePath(value: string) {
  return !value || path.isAbsolute(value) || value.includes("../") || value.includes("/..") || value === "..";
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeExportName(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("invalid_export_name");
  return trimmed;
}

function buildExportBaseName(name: string) {
  return sanitizeFileName(name) || "kakaotalk-theme";
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

async function downloadText(ref: GcsObjectRef) {
  const [bytes] = await storage.bucket(ref.bucket).file(ref.object).download();
  return bytes.toString("utf8");
}

async function downloadBytes(ref: GcsObjectRef) {
  const [bytes] = await storage.bucket(ref.bucket).file(ref.object).download();
  return new Uint8Array(bytes);
}

async function uploadJson(prefix: GcsPrefixRef, fileName: string, value: ResultJson) {
  await storage.bucket(prefix.bucket).file(joinGcsPath(prefix.prefix, fileName)).save(JSON.stringify(value, null, 2), {
    contentType: "application/json",
    resumable: false,
  });
}

async function resolveBuildSource(): Promise<BuildSource> {
  if (!gcsInputUri && !gcsOutputUri) return { mode: "local", inputDir, outputDir };
  if (!gcsInputUri || !gcsOutputUri) throw new Error("gcs_config_incomplete");

  const input = parseGcsObjectUri(gcsInputUri);
  const inputPrefix = input.object.endsWith("/bundle.json") ? input.object.slice(0, -"bundle.json".length).replace(/\/$/, "") : input.object.replace(/\/$/, "");
  const bundleObject = input.object.endsWith("/bundle.json") ? input.object : joinGcsPath(inputPrefix, "bundle.json");
  const inputBundle = { bucket: input.bucket, object: bundleObject };
  const bundle = await readJsonFromGcs(inputBundle);
  if (!isLocalBundle(bundle)) throw new Error("invalid_bundle");
  const exportJobId = nonEmptyString(bundle.export_job_id);
  if (!exportJobId) throw new Error("missing_export_job_id");
  if (inputPrefix !== exportJobId && !inputPrefix.endsWith(`/${exportJobId}`)) throw new Error("gcs_input_prefix_mismatch");

  return {
    mode: "gcs",
    input: inputBundle,
    inputPrefix,
    output: resolveOutputPrefix(gcsOutputUri, exportJobId),
    exportJobId,
  };
}

async function readJsonFromGcs(ref: GcsObjectRef): Promise<unknown> {
  return JSON.parse(await downloadText(ref));
}

function parseGcsObjectUri(uri: string): GcsObjectRef {
  if (!uri.startsWith("gs://")) throw new Error("gcs_uri_invalid");
  const withoutScheme = uri.slice("gs://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0 || slash === withoutScheme.length - 1) throw new Error("gcs_uri_invalid");
  return { bucket: withoutScheme.slice(0, slash), object: normalizeGcsObjectPath(withoutScheme.slice(slash + 1)) };
}

function resolveOutputPrefix(uri: string, exportJobId: string): GcsPrefixRef {
  if (!uri.startsWith("gs://")) throw new Error("gcs_uri_invalid");
  const withoutScheme = uri.slice("gs://".length).replace(/\/+$/, "");
  const slash = withoutScheme.indexOf("/");
  if (slash === -1) return { bucket: withoutScheme, prefix: exportJobId };
  const bucket = withoutScheme.slice(0, slash);
  const rawPrefix = withoutScheme.slice(slash + 1);
  return { bucket, prefix: rawPrefix ? normalizeGcsObjectPath(rawPrefix) : exportJobId };
}

function normalizeGcsObjectPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || isUnsafeRelativePath(normalized)) throw new Error("gcs_object_path_invalid");
  return normalized;
}

function joinGcsPath(...parts: string[]) {
  return parts.map((part) => part.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof Error) return error.name || "error";
  return "error";
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ event, ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) }));
}
