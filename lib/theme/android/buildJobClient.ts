import type { AndroidBundleUploadFile, AndroidExportManifestItem } from "@/lib/theme/android/requestShared";

// Vercel/Cloudflare → GCP를 Workload Identity Federation(OIDC)으로 인증하고, 입력 번들을 GCS에 올린 뒤
// Cloud Run Job 실행을 트리거한다. SA JSON 키를 쓰지 않으며 fetch만 사용(엣지 안전)한다.

const GCP_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const defaultCloudflareSubject = "cloudflare-worker-prod";
const oidcTokenTtlSeconds = 5 * 60;

type OidcPrivateJwk = JsonWebKey & { kid?: string; d?: string; n?: string; e?: string };

export type AndroidBuildBundle = {
  exportJobId: string;
  userId: string;
  themeId: string;
  options: { mode: string; exportName: string; versionName?: string; applicationId?: string };
  manifest: AndroidExportManifestItem[];
  files: AndroidBundleUploadFile[];
};

export class AndroidBuildEnqueueError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AndroidBuildEnqueueError";
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
};

export function readBuilderConfig(): BuilderConfig {
  const projectId = requireEnv("GCP_PROJECT_ID");
  const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
  const poolId = process.env.GCP_WIF_POOL_ID ?? "vercel-pool";
  const providerId = process.env.GCP_WIF_PROVIDER_ID ?? "cloudflare-provider";
  const wifAudience =
    process.env.GCP_WIF_AUDIENCE ??
    `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  return {
    projectId,
    wifAudience,
    oidcIssuer: requireEnv("CLOUDFLARE_OIDC_ISSUER"),
    oidcSubject: process.env.CLOUDFLARE_OIDC_SUBJECT ?? defaultCloudflareSubject,
    oidcPrivateJwk: readPrivateJwk(),
    builderServiceAccount: requireEnv("GCP_BUILDER_SA_EMAIL"),
    inputBucket: requireEnv("GCP_BUILD_INPUT_BUCKET"),
    outputBucket: requireEnv("GCP_BUILD_OUTPUT_BUCKET"),
    jobRegion: requireEnv("GCP_BUILD_JOB_REGION"),
    jobName: requireEnv("GCP_BUILD_JOB_NAME"),
  };
}

export function isAsyncAndroidExportEnabled() {
  return process.env.ANDROID_EXPORT_ASYNC === "1" || process.env.ANDROID_EXPORT_ASYNC === "true";
}

export async function enqueueAndroidBuild(bundle: AndroidBuildBundle) {
  const config = readBuilderConfig();
  const accessToken = await getBuilderAccessToken(config);
  const prefix = bundle.exportJobId;

  const bundleJson = JSON.stringify({
    export_job_id: bundle.exportJobId,
    user_id: bundle.userId,
    theme_id: bundle.themeId,
    options: {
      mode: bundle.options.mode,
      exportName: bundle.options.exportName,
      ...(bundle.options.versionName ? { versionName: bundle.options.versionName } : {}),
      ...(bundle.options.applicationId ? { applicationId: bundle.options.applicationId } : {}),
    },
    manifest: bundle.manifest,
  });

  await uploadObject(config.inputBucket, `${prefix}/bundle.json`, new TextEncoder().encode(bundleJson), "application/json", accessToken);
  for (const file of bundle.files) {
    await uploadObject(config.inputBucket, `${prefix}/files/${file.field}`, file.bytes, "application/octet-stream", accessToken);
  }

  await runBuilderJob(config, accessToken, {
    inputUri: `gs://${config.inputBucket}/${prefix}`,
    outputUri: `gs://${config.outputBucket}/${prefix}`,
  });
}

// 자체 OIDC JWT → STS 토큰 교환 → 대상 SA impersonation 순으로 단명 액세스 토큰을 얻는다.
export async function getBuilderAccessToken(config: BuilderConfig) {
  const oidcToken = await signCloudflareOidcToken(config);
  const federatedToken = await exchangeStsToken(config.wifAudience, oidcToken);
  return impersonateServiceAccount(config.builderServiceAccount, federatedToken);
}

async function signCloudflareOidcToken(config: BuilderConfig) {
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

async function exchangeStsToken(audience: string, subjectToken: string) {
  const response = await fetch("https://sts.googleapis.com/v1/token", {
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
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new AndroidBuildEnqueueError("sts_exchange_failed", "GCP 토큰 교환에 실패했습니다.");
  }
  return payload.access_token;
}

async function impersonateServiceAccount(serviceAccount: string, federatedToken: string) {
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${federatedToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: [GCP_SCOPE] }),
    },
  );
  const payload = (await response.json().catch(() => null)) as { accessToken?: string } | null;
  if (!response.ok || !payload?.accessToken) {
    throw new AndroidBuildEnqueueError("impersonation_failed", "빌더 서비스 계정 인증에 실패했습니다.");
  }
  return payload.accessToken;
}

async function uploadObject(bucket: string, objectName: string, bytes: Uint8Array, contentType: string, accessToken: string) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) {
    throw new AndroidBuildEnqueueError("gcs_upload_failed", "빌드 입력 업로드에 실패했습니다.");
  }
}

async function runBuilderJob(config: BuilderConfig, accessToken: string, uris: { inputUri: string; outputUri: string }) {
  const url = `https://${config.jobRegion}-run.googleapis.com/v2/projects/${config.projectId}/locations/${config.jobRegion}/jobs/${config.jobName}:run`;
  const response = await fetch(url, {
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
  });
  if (!response.ok) {
    throw new AndroidBuildEnqueueError("job_run_failed", "빌드 작업 실행에 실패했습니다.");
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new AndroidBuildEnqueueError("missing_config", "빌드 서비스 설정이 완료되지 않았습니다.");
  return value;
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
    throw new AndroidBuildEnqueueError("invalid_oidc_private_key", "OIDC 서명 키 설정이 올바르지 않습니다.");
  }
}

function readKeyId(jwk: OidcPrivateJwk) {
  const kid = typeof jwk.kid === "string" && jwk.kid.trim() ? jwk.kid.trim() : process.env.CLOUDFLARE_OIDC_KEY_ID;
  if (!kid) throw new AndroidBuildEnqueueError("missing_oidc_key_id", "OIDC 서명 키 ID 설정이 없습니다.");
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
