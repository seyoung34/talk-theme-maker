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
  ) {
    super(message);
    this.name = "BuildEnqueueError";
  }
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

export async function enqueueBuild(bundle: ExportBuildBundle, options: { platform?: BuilderPlatform; jobNameEnv?: string } = {}) {
  const config = readBuilderConfig(options);
  const accessToken = await getBuilderAccessToken(config);
  const prefix = bundle.exportJobId;
  const inputArchive = options.platform === "ios" ? createInputArchive(bundle.files) : null;

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

  await runBuilderJob(config, accessToken, {
    inputUri: `gs://${config.inputBucket}/${prefix}`,
    outputUri: `gs://${config.outputBucket}/${prefix}`,
  });
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
  const response = await fetchWithTimeout("https://sts.googleapis.com/v1/token", {
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
  }, {
    code: "sts_exchange_request_failed",
    message: "GCP 토큰 교환 요청에 실패했습니다.",
    timeoutMs: gcpRequestTimeoutMs,
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;
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
  const response = await fetchWithTimeout(
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
  );
  const payload = (await response.json().catch(() => null)) as { accessToken?: string } | null;
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
  });
  if (!response.ok) {
    throw new BuildEnqueueError("gcs_upload_failed", "빌드 입력 업로드에 실패했습니다.", `HTTP ${response.status}`);
  }
  await response.arrayBuffer();
}

export async function runBuilderJob(config: BuilderConfig, accessToken: string, uris: { inputUri: string; outputUri: string }) {
  const url = buildRunJobUrl(config);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "GCS_INPUT_URI", value: uris.inputUri },
              { name: "GCS_OUTPUT_URI", value: uris.outputUri },
            ],
          },
        ],
      },
    }),
  }, {
    code: "job_run_request_failed",
    message: "Cloud Run 작업 실행 요청에 실패했습니다.",
    timeoutMs: cloudRunRequestTimeoutMs,
  });
  if (!response.ok) {
    throw new BuildEnqueueError("job_run_failed", "빌드 작업 실행에 실패했습니다.", await readHttpErrorDetail(response));
  }
  await response.arrayBuffer();
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
  options: { code: string; message: string; timeoutMs: number },
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new BuildEnqueueError(options.code, options.message, detail.slice(0, 240));
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

async function readHttpErrorDetail(response: Response) {
  const body = (await response.text().catch(() => "")).trim().replace(/\s+/g, " ");
  return `HTTP ${response.status}${body ? `: ${body}` : ""}`.slice(0, 800);
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
