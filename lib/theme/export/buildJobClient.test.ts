import { afterEach, describe, expect, it, vi } from "vitest";
import { getImpersonatedAccessToken, runBuilderJob, type BuilderConfig } from "@/lib/theme/export/buildJobClient";

const builderConfig: BuilderConfig = {
  projectId: "project-78d94000-bff9-4358-821",
  wifAudience: "//iam.googleapis.com/projects/779222832316/locations/global/workloadIdentityPools/vercel-pool/providers/cloudflare-provider",
  oidcIssuer: "https://talktheme.shop",
  oidcSubject: "cloudflare-worker-prod",
  oidcPrivateJwk: { kty: "RSA", alg: "RS256", n: "n", e: "AQAB", d: "d" },
  builderServiceAccount: "vercel-builder@project-78d94000-bff9-4358-821.iam.gserviceaccount.com",
  inputBucket: "kt-theme-build-input-dev",
  outputBucket: "kt-theme-build-output-dev",
  jobRegion: "asia-northeast3",
  jobName: "ios-builder",
};

describe("Cloud Run builder enqueue", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the global Cloud Run API endpoint for a regional job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runBuilderJob(builderConfig, "access-token", {
      inputUri: "gs://kt-theme-build-input-dev/job-id",
      outputUri: "gs://kt-theme-build-output-dev/job-id",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://run.googleapis.com/v2/projects/project-78d94000-bff9-4358-821/locations/asia-northeast3/jobs/ios-builder:run",
    );
  });

  it("converts a Cloud Run transport failure into a typed enqueue error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(runBuilderJob(builderConfig, "access-token", {
      inputUri: "gs://kt-theme-build-input-dev/job-id",
      outputUri: "gs://kt-theme-build-output-dev/job-id",
    })).rejects.toMatchObject({
      name: "BuildEnqueueError",
      code: "job_run_request_failed",
      detail: "TypeError: fetch failed",
    });
  });

  it("retains the upstream HTTP status for a rejected Cloud Run request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(runBuilderJob(builderConfig, "access-token", {
      inputUri: "gs://kt-theme-build-input-dev/job-id",
      outputUri: "gs://kt-theme-build-output-dev/job-id",
    })).rejects.toMatchObject({
      name: "BuildEnqueueError",
      code: "job_run_failed",
      detail: "HTTP 404",
    });
  });

  it("allows read-only APIs to request a narrower impersonated scope", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "federated-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "analytics-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getImpersonatedAccessToken(
      "ga4-admin@project.iam.gserviceaccount.com",
      {
        wifAudience: builderConfig.wifAudience,
        oidcIssuer: builderConfig.oidcIssuer,
        oidcSubject: builderConfig.oidcSubject,
        oidcPrivateJwk: { ...privateJwk, kid: "test-key" },
      },
      { scopes: ["https://www.googleapis.com/auth/analytics.readonly"] },
    )).resolves.toBe("analytics-token");

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      scope: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
  });

  it("keeps an external abort active while reading the STS response body", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const response = new Response(null, { status: 200 });
    let markJsonStarted!: () => void;
    const jsonStarted = new Promise<void>((resolve) => {
      markJsonStarted = resolve;
    });
    vi.spyOn(response, "json").mockImplementation(() => {
      markJsonStarted();
      return new Promise<unknown>(() => {});
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const tokenPromise = getImpersonatedAccessToken(
      "ga4-admin@project.iam.gserviceaccount.com",
      {
        wifAudience: builderConfig.wifAudience,
        oidcIssuer: builderConfig.oidcIssuer,
        oidcSubject: builderConfig.oidcSubject,
        oidcPrivateJwk: { ...privateJwk, kid: "test-key" },
      },
      { scopes: ["https://www.googleapis.com/auth/analytics.readonly"], signal: controller.signal },
    );

    await jsonStarted;
    controller.abort();

    await expect(tokenPromise).rejects.toMatchObject({
      name: "BuildEnqueueError",
      code: "sts_exchange_request_failed",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
