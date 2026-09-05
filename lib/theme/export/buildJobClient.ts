import { mapWithConcurrency } from "@/lib/shared/concurrency";
import { createInputArchive, INPUT_ARCHIVE_FILE_NAME } from "@/lib/theme/export/inputArchive";
import type { ResolvedCatalogManifestItem } from "@/lib/theme/assetCatalog/registry";

// Cloudflare Worker → GCP를 Workload Identity Federation(OIDC)으로 인증하고,
// 입력 번들을 GCS에 올린 뒤 Cloud Run Job 실행을 트리거한다. SA JSON 키는 사용하지 않는다.

const GCP_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const defaultCloudflareSubject = "cloudflare-worker-prod";
const oidcTokenTtlSeconds = 5 * 60;
const uploadConcurrency = 8;
const gcpRequestTimeoutMs = 30_000;
const cloudRunRequestTimeoutMs = 15_000;

type OidcPrivateJwk = JsonWebKey & { kid?: string; d?: string; n?: string; e?: string };

export type ExportManifestItem =
  | { path: string; field: string }
  | { path: string; serverAsset: string }
  | ResolvedCatalogManifestItem;

export type BuildInputFile = {
  field: string;
  bytes: Uint8Array;
};

export type ExportBuildBundle = {
  exportJobId: string;
  userId: string;
  themeId?: string;
  options: {
    mode: string;
    exportName: string;
    versionName?: string;
    applicationId?: string;
    themeIdentifier?: string;
  };
  manifest: ExportManifestItem[];
  files: BuildInputFile[];
};

export class BuildEnqueueError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: string,
    options: { ambiguous?: boolean } = {},
  ) {
    super(message);
    this.name = "BuildEnqueueError";
    this.ambiguous = options.ambiguous ?? false;
  }

  /**
   * The request may have reached Cloud Run even though its response was not
   * received. Such a failure must be reconciled instead of being refunded
   * immediately, because the job may still be running.
   */
  readonly ambiguous: boolean;
}

export type BuilderConfig = {
  projectId: string;
  wifAudience: string;
  oidcIssuer: string;
  oidcSubject: string;
  oidcPrivateJwk: OidcPrivateJwk;
  builderServiceAccount: string;
  inputBucket: string;
  outputBucket: string;
  jobRegion: string;
  jobName: string;
  jobNameEnv?: string;
};

export type BuilderPlatform = "android" | "ios";

export type BuilderRunResult = {
  operationName: string | null;
};

export type EnqueueBuildProgress = {
  onInputUploadStarted?: () => void | Promise<void>;
  onInputReady?: () => void | Promise<void>;
  onTriggering?: () => void | Promise<void>;
  onTriggered?: (result: BuilderRunResult) => void | Promise<void>;
};

export type EnqueueBuildOptions = {
  platform?: BuilderPlatform;
  jobNameEnv?: string;
  attempt?: number;
  progress?: EnqueueBuildProgress;
};

export type BuilderInputInspection = {
  complete: boolean;
  expectedObjectNames: string[];
  actualObjectNames: string[];
  missingObjectNames: string[];
};

export type BuilderExecution = {
  name: string;
  createTime?: string;
};

export function getBuilderJobNameEnv(platform: BuilderPlatform) {
  return platform === "ios" ? "GCP_IOS_BUILD_JOB_NAME" : "GCP_BUILD_JOB_NAME";
}

/**
 * Cloudflare Worker가 GCP 신원을 얻는 데 필요한 값만 모은 것.
 *
 * 빌드와 무관한 경로(예: catalog publish)도 같은 OIDC → STS → impersonation 체인을 쓴다.
 * 체인을 복제하면 issuer·subject·audience 규칙이 갈라지므로 여기 하나로 둔다.
 */
export type GcpOidcConfig = {
  wifAudience: string;
  oidcIssuer: string;
  oidcSubject: string;
  oidcPrivateJwk: OidcPrivateJwk;
};

export function readGcpOidcConfig(): GcpOidcConfig {
  const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
  const poolId = optionalEnv("GCP_WIF_POOL_ID") ?? "vercel-pool";
  const providerId = optionalEnv("GCP_WIF_PROVIDER_ID") ?? "cloudflare-provider";
  return {
    wifAudience:
      optionalEnv("GCP_WIF_AUDIENCE") ??
      `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    oidcIssuer: requireEnv("CLOUDFLARE_OIDC_ISSUER"),
    oidcSubject: optionalEnv("CLOUDFLARE_OIDC_SUBJECT") ?? defaultCloudflareSubject,
    oidcPrivateJwk: readPrivateJwk(),
  };
}

export function readBuilderConfig(options: { platform?: BuilderPlatform; jobNameEnv?: string } = {}): BuilderConfig {
  const projectId = requireEnv("GCP_PROJECT_ID");
  const jobNameEnv = options.jobNameEnv ?? (options.platform ? getBuilderJobNameEnv(options.platform) : "GCP_BUILD_JOB_NAME");
  return {
    projectId,
    ...readGcpOidcConfig(),
    builderServiceAccount: requireEnv("GCP_BUILDER_SA_EMAIL"),
    inputBucket: requireEnv("GCP_BUILD_INPUT_BUCKET"),
    outputBucket: requireEnv("GCP_BUILD_OUTPUT_BUCKET"),
    jobRegion: requireEnv("GCP_BUILD_JOB_REGION"),
    jobName: requireEnv(jobNameEnv),
    jobNameEnv,
  };
}

export async function enqueueBuild(bundle: ExportBuildBundle, options: EnqueueBuildOptions = {}): Promise<BuilderRunResult> {
  const config = readBuilderConfig(options);
  const accessToken = await getBuilderAccessToken(config);
  const prefix = bundle.exportJobId;
  const inputArchive = options.platform === "ios" ? createInputArchive(bundle.files) : null;
  await options.progress?.onInputUploadStarted?.();

  const bundleJson = JSON.stringify({
    export_job_id: bundle.exportJobId,
    user_id: bundle.userId,
    ...(bundle.themeId ? { theme_id: bundle.themeId } : {}),
    options: {
      mode: bundle.options.mode,
      exportName: bundle.options.exportName,
      ...(bundle.options.versionName ? { versionName: bundle.options.versionName } : {}),
      ...(bundle.options.applicationId ? { applicationId: bundle.options.applicationId } : {}),
      ...(bundle.options.themeIdentifier ? { themeIdentifier: bundle.options.themeIdentifier } : {}),
    },
    manifest: bundle.manifest,
    ...(inputArchive ? { files_archive: INPUT_ARCHIVE_FILE_NAME } : {}),
  });

  const uploads: Promise<unknown>[] = [
    uploadObject(config.inputBucket, `${prefix}/bundle.json`, new TextEncoder().encode(bundleJson), "application/json", accessToken),
  ];
  if (inputArchive) {
    uploads.push(uploadObject(config.inputBucket, `${prefix}/${INPUT_ARCHIVE_FILE_NAME}`, inputArchive, "application/octet-stream", accessToken));
  } else {
    uploads.push(
      mapWithConcurrency(bundle.files, uploadConcurrency, (file) =>
        uploadObject(config.inputBucket, `${prefix}/files/${file.field}`, file.bytes, "application/octet-stream", accessToken),
      ),
    );
  }
  await Promise.all(uploads);
  await options.progress?.onInputReady?.();

  await options.progress?.onTriggering?.();
  const result = await runBuilderJob(config, accessToken, {
    inputUri: `gs://${config.inputBucket}/${prefix}`,
    outputUri: `gs://${config.outputBucket}/${prefix}`,
    exportJobId: bundle.exportJobId,
    attempt: options.attempt ?? 0,
  });
  await options.progress?.onTriggered?.(result);
  return result;
}

// 자체 OIDC JWT → STS 토큰 교환 → 대상 SA impersonation 순으로 단명 액세스 토큰을 얻는다.
export async function getBuilderAccessToken(config: BuilderConfig) {
  return getImpersonatedAccessToken(config.builderServiceAccount, config);
}

/**
 * 임의의 대상 SA로 impersonation한다.
 *
 * 대상 SA마다 WIF 주체(`principal://…/subject/cloudflare-worker-prod`)에
 * `roles/iam.workloadIdentityUser`가 걸려 있어야 한다. 그 역할이 `getAccessToken`을 포함한다.
 */
export async function getImpersonatedAccessToken(
  serviceAccount: string,
  config: GcpOidcConfig,
  options: { scopes?: string[]; signal?: AbortSignal } = {},
) {
  const oidcToken = await signCloudflareOidcToken(config);
  const federatedToken = await exchangeStsToken(config.wifAudience, oidcToken, options.signal);
  return impersonateServiceAccount(serviceAccount, federatedToken, options.scopes ?? [GCP_SCOPE], options.signal);
}

async function signCloudflareOidcToken(config: GcpOidcConfig) {
  const now = Math.floor(Date.now() / 1000);
  const privateJwk = config.oidcPrivateJwk;
  const kid = readKeyId(privateJwk);
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = {
    iss: config.oidcIssuer,
    sub: config.oidcSubject,
    aud: config.wifAudience,
    iat: now,
    exp: now + oidcTokenTtlSeconds,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function exchangeStsToken(audience: string, subjectToken: string, signal?: AbortSignal) {
  const { response, payload } = await fetchWithTimeout(
    "https://sts.googleapis.com/v1/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience,
        scope: GCP_SCOPE,
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        subjectToken,
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      }),
      signal,
    },
    {
      code: "sts_exchange_request_failed",
      message: "GCP 토큰 교환 요청에 실패했습니다.",
      timeoutMs: gcpRequestTimeoutMs,
    },
    async (response) => ({
      response,
      payload: await readJsonOrNull<{ access_token?: string }>(response),
    }),
  );
  if (!response.ok || !payload?.access_token) {
    throw new BuildEnqueueError("sts_exchange_failed", "GCP 토큰 교환에 실패했습니다.");
  }
  return payload.access_token;
}

async function impersonateServiceAccount(
  serviceAccount: string,
  federatedToken: string,
  scopes: string[],
  signal?: AbortSignal,
) {
  const { response, payload } = await fetchWithTimeout(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${federatedToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: scopes }),
      signal,
    },
    {
      code: "impersonation_request_failed",
      message: "빌더 서비스 계정 인증 요청에 실패했습니다.",
      timeoutMs: gcpRequestTimeoutMs,
    },
    async (response) => ({
      response,
      payload: await readJsonOrNull<{ accessToken?: string }>(response),
    }),
  );
  if (!response.ok || !payload?.accessToken) {
    throw new BuildEnqueueError("impersonation_failed", "빌더 서비스 계정 인증에 실패했습니다.");
  }
  return payload.accessToken;
}

export async function uploadObject(bucket: string, objectName: string, bytes: Uint8Array, contentType: string, accessToken: string) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes as unknown as BodyInit,
  }, {
    code: "gcs_upload_request_failed",
    message: "빌드 입력 업로드 요청에 실패했습니다.",
    timeoutMs: gcpRequestTimeoutMs,
  }, async (response) => {
    await response.arrayBuffer();
    return response;
  });
  if (!response.ok) {
    throw new BuildEnqueueError("gcs_upload_failed", "빌드 입력 업로드에 실패했습니다.", `HTTP ${response.status}`);
  }
}

export async function runBuilderJob(
  config: BuilderConfig,
  accessToken: string,
  uris: { inputUri: string; outputUri: string; exportJobId?: string; attempt?: number },
): Promise<BuilderRunResult> {
  const url = buildRunJobUrl(config);
  const { response, body } = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "GCS_INPUT_URI", value: uris.inputUri },
              { name: "GCS_OUTPUT_URI", value: uris.outputUri },
              ...(uris.exportJobId ? [{ name: "EXPORT_JOB_ID", value: uris.exportJobId }] : []),
              { name: "EXPORT_ENQUEUE_ATTEMPT", value: String(uris.attempt ?? 0) },
            ],
          },
        ],
      },
    }),
  }, {
    code: "job_run_request_failed",
    message: "Cloud Run 작업 실행 요청에 실패했습니다.",
    timeoutMs: cloudRunRequestTimeoutMs,
    ambiguousOnConsumeError: true,
  }, async (response) => ({ response, body: await response.text() }));
  if (!response.ok) {
    throw new BuildEnqueueError("job_run_failed", "빌드 작업 실행에 실패했습니다.", readHttpErrorDetail(response.status, body));
  }
  const payload = parseJsonOrNull<{ name?: unknown }>(body);
  return { operationName: typeof payload?.name === "string" && payload.name.trim() ? payload.name.trim() : null };
}

/**
 * Inspect the input prefix before using the one recovery retry. This keeps a
 * request that died during a partial upload from being retried with another
 * incomplete bundle.
 */
export async function inspectBuilderInput(
  config: BuilderConfig,
  accessToken: string,
  exportJobId: string,
): Promise<BuilderInputInspection> {
  const bundleObjectName = `${exportJobId}/bundle.json`;
  const bundleUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.inputBucket)}/o/${encodeURIComponent(bundleObjectName)}?alt=media`;
  const { response: bundleResponse, body: bundleBody } = await fetchWithTimeout(bundleUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, {
    code: "gcs_input_inspection_failed",
    message: "빌드 입력 상태를 확인하지 못했습니다.",
    timeoutMs: gcpRequestTimeoutMs,
  }, async (response) => ({ response, body: await response.text() }));

  if (bundleResponse.status === 404) {
    return {
      complete: false,
      expectedObjectNames: [bundleObjectName],
      actualObjectNames: [],
      missingObjectNames: [bundleObjectName],
    };
  }
  if (!bundleResponse.ok) {
    throw new BuildEnqueueError("gcs_input_inspection_failed", "빌드 입력 상태를 확인하지 못했습니다.", readHttpErrorDetail(bundleResponse.status, bundleBody));
  }

  const bundle = parseJsonOrNull<{
    files_archive?: unknown;
    manifest?: unknown;
  }>(bundleBody);
  if (!bundle || (bundle.files_archive !== undefined && typeof bundle.files_archive !== "string") || !Array.isArray(bundle.manifest)) {
    throw new BuildEnqueueError("input_bundle_invalid", "빌드 입력 번들이 올바르지 않습니다.");
  }

  const expectedObjectNames = [bundleObjectName];
  if (typeof bundle.files_archive === "string" && bundle.files_archive.trim()) {
    expectedObjectNames.push(`${exportJobId}/${bundle.files_archive}`);
  } else {
    const fields = new Set<string>();
    for (const item of bundle.manifest) {
      if (isRecord(item) && typeof item.field === "string" && item.field.trim()) fields.add(item.field);
    }
    for (const field of fields) expectedObjectNames.push(`${exportJobId}/files/${field}`);
  }

  const query = new URLSearchParams({ prefix: `${exportJobId}/`, maxResults: "1000" });
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.inputBucket)}/o?${query.toString()}`;
  const { response: listResponse, payload } = await fetchWithTimeout(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, {
    code: "gcs_input_inspection_failed",
    message: "빌드 입력 상태를 확인하지 못했습니다.",
    timeoutMs: gcpRequestTimeoutMs,
  }, async (response) => ({
    response,
    payload: await readJsonOrNull<{ items?: Array<{ name?: unknown }> }>(response),
  }));
  if (!listResponse.ok) {
    throw new BuildEnqueueError("gcs_input_inspection_failed", "빌드 입력 상태를 확인하지 못했습니다.", `HTTP ${listResponse.status}`);
  }
  if (!isRecord(payload) || (payload.items !== undefined && !Array.isArray(payload.items))) {
    throw new BuildEnqueueError("gcs_input_inspection_failed", "빌드 입력 상태를 확인하지 못했습니다.", "invalid GCS object list response");
  }

  const actualObjectNames = (payload.items ?? [])
    .filter(isRecord)
    .map((item) => item.name)
    .filter((name): name is string => typeof name === "string");
  const actualObjects = new Set(actualObjectNames);
  const missingObjectNames = expectedObjectNames.filter((name) => !actualObjects.has(name));
  return { complete: missingObjectNames.length === 0, expectedObjectNames, actualObjectNames, missingObjectNames };
}

/** Find an execution created by this export after an ambiguous run response. */
export async function findBuilderExecution(
  config: BuilderConfig,
  accessToken: string,
  exportJobId: string,
  options: { createdAt?: string } = {},
): Promise<BuilderExecution | null> {
  const projectId = validatePathSegment(config.projectId, "GCP_PROJECT_ID");
  const jobRegion = validatePathSegment(config.jobRegion, "GCP_BUILD_JOB_REGION");
  const jobName = validatePathSegment(config.jobName, config.jobNameEnv ?? "GCP_BUILD_JOB_NAME");
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const url = `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(jobRegion)}/jobs/${encodeURIComponent(jobName)}/executions?${query.toString()}`;
    const { response, payload } = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, {
      code: "builder_execution_lookup_failed",
      message: "빌드 실행 상태를 확인하지 못했습니다.",
      timeoutMs: cloudRunRequestTimeoutMs,
    }, async (response) => ({
      response,
      payload: await readJsonOrNull<{ executions?: unknown[]; nextPageToken?: unknown }>(response),
    }));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new BuildEnqueueError("builder_execution_lookup_failed", "빌드 실행 상태를 확인하지 못했습니다.", `HTTP ${response.status}`);
    }
    if (!isRecord(payload) || (payload.executions !== undefined && !Array.isArray(payload.executions)) || (payload.nextPageToken !== undefined && typeof payload.nextPageToken !== "string")) {
      throw new BuildEnqueueError("builder_execution_lookup_failed", "빌드 실행 상태를 확인하지 못했습니다.", "invalid Cloud Run execution list response");
    }

    const executions = payload.executions ?? [];
    for (const value of executions) {
      if (!isRecord(value) || typeof value.name !== "string") continue;
      if (executionBelongsToExport(value, exportJobId)) {
        return {
          name: value.name,
          createTime: typeof value.createTime === "string" ? value.createTime : undefined,
        };
      }
    }

    const nextPageToken = payload.nextPageToken || undefined;
    if (!nextPageToken) return null;

    // Cloud Run returns executions newest first. Once every usable timestamp in
    // this page predates the export reservation, older pages cannot contain its
    // execution. This also keeps a busy job from making recovery unbounded.
    if (options.createdAt && executions.length > 0 && executions.every((value) => {
      if (!isRecord(value) || typeof value.createTime !== "string") return false;
      const executionTime = Date.parse(value.createTime);
      const exportTime = Date.parse(options.createdAt!);
      return Number.isFinite(executionTime) && Number.isFinite(exportTime) && executionTime < exportTime;
    })) return null;

    pageToken = nextPageToken;
  }
  return null;
}

function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new BuildEnqueueError("missing_config", "빌드 서비스 설정이 완료되지 않았습니다.");
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function buildRunJobUrl(config: Pick<BuilderConfig, "projectId" | "jobRegion" | "jobName" | "jobNameEnv">) {
  const projectId = validatePathSegment(config.projectId, "GCP_PROJECT_ID");
  const jobRegion = validatePathSegment(config.jobRegion, "GCP_BUILD_JOB_REGION");
  const jobName = validatePathSegment(config.jobName, config.jobNameEnv ?? "GCP_BUILD_JOB_NAME");
  return `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(jobRegion)}/jobs/${encodeURIComponent(jobName)}:run`;
}

function validatePathSegment(value: string, envName: string) {
  const normalized = value.trim();
  if (!normalized || /[\s/\\]/.test(normalized)) {
    throw new BuildEnqueueError("invalid_config", `${envName} 설정이 올바르지 않습니다.`);
  }
  return normalized;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchTimeoutOptions,
): Promise<Response>;
async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchTimeoutOptions,
  consumeResponse: (response: Response) => Promise<T>,
): Promise<T>;
async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: FetchTimeoutOptions,
  consumeResponse?: (response: Response) => Promise<T>,
): Promise<Response | T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return consumeResponse
      ? await awaitWithAbort(consumeResponse(response), controller.signal)
      : response;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new BuildEnqueueError(options.code, options.message, detail.slice(0, 240), {
      ambiguous: Boolean(consumeResponse && options.ambiguousOnConsumeError),
    });
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

type FetchTimeoutOptions = {
  code: string;
  message: string;
  timeoutMs: number;
  ambiguousOnConsumeError?: boolean;
};

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

async function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => rejectOnce(createAbortError());

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    operation.then(resolveOnce, rejectOnce);
  });
}

function createAbortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

function readHttpErrorDetail(status: number, body: string) {
  const normalizedBody = body.trim().replace(/\s+/g, " ");
  return `HTTP ${status}${normalizedBody ? `: ${normalizedBody}` : ""}`.slice(0, 800);
}

function parseJsonOrNull<T>(body: string): T | null {
  if (!body.trim()) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function executionBelongsToExport(value: Record<string, unknown>, exportJobId: string) {
  // Cloud Run v2 Execution responses expose the task template as
  // execution.template.template, unlike Job responses where the containers
  // are directly under the job template.
  const executionTemplate = isRecord(value.template) ? value.template : null;
  const taskTemplate = executionTemplate && isRecord(executionTemplate.template) ? executionTemplate.template : null;
  const containers = taskTemplate && Array.isArray(taskTemplate.containers) ? taskTemplate.containers : [];
  for (const container of containers) {
    if (!isRecord(container) || !Array.isArray(container.env)) continue;
    for (const env of container.env) {
      if (!isRecord(env) || typeof env.name !== "string" || typeof env.value !== "string") continue;
      if (env.name === "EXPORT_JOB_ID" && env.value === exportJobId) return true;
      if (env.name === "GCS_INPUT_URI" && env.value.endsWith(`/${exportJobId}`)) return true;
    }
  }
  return false;
}

function readPrivateJwk() {
  const raw = requireEnv("CLOUDFLARE_OIDC_PRIVATE_JWK");
  try {
    const parsed = JSON.parse(raw) as OidcPrivateJwk;
    if (parsed.kty !== "RSA" || parsed.alg !== "RS256" || !parsed.n || !parsed.e || !parsed.d) {
      throw new Error("invalid private jwk");
    }
    return parsed;
  } catch {
    throw new BuildEnqueueError("invalid_oidc_private_key", "OIDC 서명 키 설정이 올바르지 않습니다.");
  }
}

function readKeyId(jwk: OidcPrivateJwk) {
  const kid = typeof jwk.kid === "string" && jwk.kid.trim() ? jwk.kid.trim() : process.env.CLOUDFLARE_OIDC_KEY_ID;
  if (!kid) throw new BuildEnqueueError("missing_oidc_key_id", "OIDC 서명 키 ID 설정이 없습니다.");
  return kid;
}

function base64UrlJson(value: unknown) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
