import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueBuild, findBuilderExecution, getImpersonatedAccessToken, runBuilderJob, type BuilderConfig } from "@/lib/theme/export/buildJobClient";
import { INPUT_ARCHIVE_FILE_NAME, readInputArchive } from "@/lib/theme/export/inputArchive";

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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("returns the Cloud Run operation and tags the execution with the export", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ name: "operations/export-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runBuilderJob(builderConfig, "access-token", {
      inputUri: "gs://kt-theme-build-input-dev/job-id",
      outputUri: "gs://kt-theme-build-output-dev/job-id",
      exportJobId: "job-id",
      attempt: 1,
    })).resolves.toEqual({ operationName: "operations/export-1" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.overrides.containerOverrides[0].env).toEqual([
      { name: "GCS_INPUT_URI", value: "gs://kt-theme-build-input-dev/job-id" },
      { name: "GCS_OUTPUT_URI", value: "gs://kt-theme-build-output-dev/job-id" },
      { name: "EXPORT_JOB_ID", value: "job-id" },
      { name: "EXPORT_ENQUEUE_ATTEMPT", value: "1" },
    ]);
  });

  it("marks a response-body timeout as ambiguous after Cloud Run may have accepted it", async () => {
    vi.useFakeTimers();
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, "text").mockImplementation(() => new Promise<string>(() => {}));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    const request = runBuilderJob(builderConfig, "access-token", {
      inputUri: "gs://kt-theme-build-input-dev/job-id",
      outputUri: "gs://kt-theme-build-output-dev/job-id",
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "BuildEnqueueError",
      code: "job_run_request_failed",
      ambiguous: true,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it("continues through the execution list when a busy job pushes the match to a later page", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        executions: [{ name: "executions/newer", createTime: "2026-09-05T01:00:00Z", template: { containers: [] } }],
        nextPageToken: "next-page",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        executions: [{
          name: "executions/matching",
          createTime: "2026-09-04T23:00:00Z",
          template: { containers: [{ env: [{ name: "EXPORT_JOB_ID", value: "job-id" }] }] },
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(findBuilderExecution(builderConfig, "access-token", "job-id", { createdAt: "2026-09-04T22:00:00Z" })).resolves.toEqual({
      name: "executions/matching",
      createTime: "2026-09-04T23:00:00Z",
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("pageToken=next-page");
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

// A Cloudflare Worker request is capped at 50 subrequests. Uploading one GCS object
// per input file used to cross that ceiling on themes with 40+ files: the request was
// killed mid-upload, and the catch block could not even record the failure because
// writing it needed one more subrequest. Both platforms now upload a single archive,
// so the subrequest count must stay flat as the file count grows.
describe("builder input upload", () => {
  const uploadEndpoint = "https://storage.googleapis.com/upload/storage/v1/b/";

  function archiveCall(fetchMock: { mock: { calls: Parameters<typeof fetch>[] } }) {
    return fetchMock.mock.calls.find((call) =>
      String(call[0]).includes(encodeURIComponent(INPUT_ARCHIVE_FILE_NAME)),
    );
  }

  function readArchiveBody(fetchMock: { mock: { calls: Parameters<typeof fetch>[] } }) {
    const url = archiveCall(fetchMock)?.[0];
    const uploaded = url === undefined ? undefined : uploadedBodies.get(String(url));
    if (!uploaded) throw new Error("archive body was not uploaded");
    return uploaded;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function stubBuilderEnv() {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    vi.stubEnv("GCP_PROJECT_ID", builderConfig.projectId);
    vi.stubEnv("GCP_PROJECT_NUMBER", "779222832316");
    vi.stubEnv("CLOUDFLARE_OIDC_ISSUER", builderConfig.oidcIssuer);
    vi.stubEnv("CLOUDFLARE_OIDC_PRIVATE_JWK", JSON.stringify({ ...privateJwk, kid: "test-key" }));
    vi.stubEnv("GCP_BUILDER_SA_EMAIL", builderConfig.builderServiceAccount);
    vi.stubEnv("GCP_BUILD_INPUT_BUCKET", builderConfig.inputBucket);
    vi.stubEnv("GCP_BUILD_OUTPUT_BUCKET", builderConfig.outputBucket);
    vi.stubEnv("GCP_BUILD_JOB_REGION", builderConfig.jobRegion);
    vi.stubEnv("GCP_BUILD_JOB_NAME", "android-builder");
  }

  // Real fetch consumes a streaming body; a mock that does not would leave the archive
  // pipe unresolved and hang `await written`. Draining here keeps the bytes available to
  // assertions while matching what the runtime actually does.
  const uploadedBodies = new Map<string, Uint8Array>();

  function stubBuilderFetch() {
    uploadedBodies.clear();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const body = init?.body;
      if (body instanceof ReadableStream) {
        uploadedBodies.set(url, await drainStream(body as ReadableStream<Uint8Array>));
      } else if (ArrayBuffer.isView(body)) {
        uploadedBodies.set(url, new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
      }
      if (url.startsWith("https://sts.googleapis.com/")) {
        return new Response(JSON.stringify({ access_token: "federated-token" }), { status: 200 });
      }
      if (url.startsWith("https://iamcredentials.googleapis.com/")) {
        return new Response(JSON.stringify({ accessToken: "builder-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: "operations/run-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function drainStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const joined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    return joined;
  }

  function bundleWithFiles(fileCount: number) {
    const files = Array.from({ length: fileCount }, (_, index) => ({
      field: `file-${index}`,
      bytes: new Uint8Array([index, index + 1]),
    }));
    return {
      exportJobId: "1ce75780-2643-4f5b-87b5-4d7025239856",
      userId: "user-1",
      themeId: "theme-1",
      options: { mode: "apk", exportName: "기본 템플릿", applicationId: "com.kakao.talk.theme.u1.e000001" },
      manifest: files.map((file) => ({ path: `res/drawable/${file.field}.png`, field: file.field })),
      files,
    };
  }

  it("uploads two objects for an Android build regardless of how many files it carries", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    // 42 files is the count that failed in production on 2026-09-11.
    await enqueueBuild(bundleWithFiles(42), { platform: "android" });

    const uploadUrls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith(uploadEndpoint));
    expect(uploadUrls).toHaveLength(2);
    expect(uploadUrls.some((url) => url.includes(encodeURIComponent("bundle.json")))).toBe(true);
    expect(uploadUrls.some((url) => url.includes(encodeURIComponent(INPUT_ARCHIVE_FILE_NAME)))).toBe(true);
  });

  it("keeps the whole enqueue well under the 50 subrequest cap as files grow", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    await enqueueBuild(bundleWithFiles(200), { platform: "android" });

    // auth (2) + uploads (2) + Cloud Run run (1). Nothing here may scale with file count.
    expect(fetchMock.mock.calls).toHaveLength(5);
  });

  it("packs every input file into the archive it uploads", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    await enqueueBuild(bundleWithFiles(3), { platform: "android" });

    const archive = readInputArchive(readArchiveBody(fetchMock));
    expect([...archive.keys()].sort()).toEqual(["file-0", "file-1", "file-2"]);
    expect(archive.get("file-1")).toEqual(new Uint8Array([1, 2]));
  });

  it("streams the archive instead of handing fetch one buffer", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    await enqueueBuild(bundleWithFiles(4), { platform: "android" });

    // The Worker has ~50MB of FormData and decoded files alive already; a second copy of
    // the archive is what pushes a large export toward the 128MB limit.
    const body = archiveCall(fetchMock)?.[1]?.body;
    expect(body).toBeInstanceOf(ReadableStream);
    expect(ArrayBuffer.isView(body)).toBe(false);
  });

  it("sets duplex on the stream body so Node's fetch accepts it", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    // No FixedLengthStream here, which is exactly the `npm run dev` / Node shape. Without
    // `duplex` that runtime throws "duplex option is required when sending a body" before
    // the request is opened, so the upload would fail without ever reaching GCS.
    expect((globalThis as Record<string, unknown>).FixedLengthStream).toBeUndefined();
    await enqueueBuild(bundleWithFiles(3), { platform: "android" });

    const init = archiveCall(fetchMock)?.[1] as (RequestInit & { duplex?: string }) | undefined;
    expect(init?.duplex).toBe("half");
  });

  it("omits duplex when the Workers runtime supplies a FixedLengthStream body", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();
    class StubFixedLengthStream {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
      constructor() {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        this.readable = readable;
        this.writable = writable;
      }
    }
    vi.stubGlobal("FixedLengthStream", StubFixedLengthStream);

    await enqueueBuild(bundleWithFiles(3), { platform: "android" });

    // Workers sets Content-Length from the stream itself; `duplex` is a Node requirement
    // and has no meaning there.
    const init = archiveCall(fetchMock)?.[1] as (RequestInit & { duplex?: string }) | undefined;
    expect(init?.duplex).toBeUndefined();
  });

  it("rejects an oversized field before it opens the upload request", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    const bundle = bundleWithFiles(1);
    bundle.files[0].field = "f".repeat(4097);

    await expect(enqueueBuild(bundle, { platform: "android" })).rejects.toThrow("input_archive_field_too_large");
    // Auth may have run, but nothing was uploaded: a length that only failed mid-stream
    // would abort a request GCS had already accepted.
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).startsWith(uploadEndpoint))).toHaveLength(0);
  });

  it("tells the builder which archive to read", async () => {
    await stubBuilderEnv();
    const fetchMock = stubBuilderFetch();

    await enqueueBuild(bundleWithFiles(2), { platform: "android" });

    const bundleCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes(encodeURIComponent("bundle.json")),
    );
    const uploaded = JSON.parse(new TextDecoder().decode(bundleCall?.[1]?.body as Uint8Array));
    expect(uploaded.files_archive).toBe(INPUT_ARCHIVE_FILE_NAME);
  });
});
