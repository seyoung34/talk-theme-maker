import { afterEach, describe, expect, it, vi } from "vitest";
import { runBuilderJob, type BuilderConfig } from "@/lib/theme/export/buildJobClient";

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
});
