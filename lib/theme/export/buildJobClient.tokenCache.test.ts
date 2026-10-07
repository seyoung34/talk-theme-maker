import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuilderAccessToken, runBuilderJob, type BuilderConfig } from "./buildJobClient";

const context = vi.hoisted(() => ({ current: {} as object }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ ctx: context.current }) }));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function fixture() {
  const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const config = { builderServiceAccount: "builder@example.com", wifAudience: "audience", oidcIssuer: "issuer", oidcSubject: "subject", oidcPrivateJwk: { ...await crypto.subtle.exportKey("jwk", key.privateKey), kid: "test" } } as BuilderConfig;
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).includes("sts.googleapis.com") ? { access_token: "federated" } : { accessToken: "builder", expireTime: new Date(Date.now() + 3600_000).toISOString() })));
  vi.stubGlobal("fetch", fetchMock);
  context.current = {};
  return { config, fetchMock };
}

describe("builder access token cache", () => {
  it("deduplicates one request's concurrent refresh and reuses completed tokens across requests", async () => {
    const { config, fetchMock } = await fixture();
    expect(await Promise.all([getBuilderAccessToken(config), getBuilderAccessToken(config)])).toEqual(["builder", "builder"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    context.current = {};
    expect(await getBuilderAccessToken(config)).toBe("builder");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes after 60 seconds and separates service account, audience, subject, issuer and key ID", async () => {
    const { config, fetchMock } = await fixture();
    vi.useFakeTimers();
    await getBuilderAccessToken(config);
    vi.setSystemTime(Date.now() + 60_001);
    await getBuilderAccessToken(config);
    await getBuilderAccessToken({ ...config, builderServiceAccount: "other@example.com" });
    await getBuilderAccessToken({ ...config, wifAudience: "other" });
    await getBuilderAccessToken({ ...config, oidcSubject: "other" });
    await getBuilderAccessToken({ ...config, oidcIssuer: "other" });
    await getBuilderAccessToken({ ...config, oidcPrivateJwk: { ...config.oidcPrivateJwk, kid: "rotated" } });
    expect(fetchMock).toHaveBeenCalledTimes(14);
  });

  it("does not cache tokens without a trustworthy expiry or within the expiry margin", async () => {
    const { config, fetchMock } = await fixture();
    for (const expireTime of [undefined, "invalid", new Date(Date.now() + 10_000).toISOString()]) {
      fetchMock.mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes("sts.googleapis.com") ? { access_token: "federated" } : { accessToken: "builder", expireTime })));
      await getBuilderAccessToken(config);
      await getBuilderAccessToken(config);
    }
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("does not share in-flight I/O between Worker requests", async () => {
    const { config, fetchMock } = await fixture();
    const first = getBuilderAccessToken(config);
    context.current = {};
    const second = getBuilderAccessToken(config);
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("removes failed refreshes so the next attempt can succeed", async () => {
    const { config, fetchMock } = await fixture();
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(getBuilderAccessToken(config)).rejects.toMatchObject({ code: "sts_exchange_request_failed" });
    expect(await getBuilderAccessToken(config)).toBe("builder");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("evicts an authentication-rejected token and refreshes next time without replaying jobs.run", async () => {
    const { config, fetchMock } = await fixture();
    const token = await getBuilderAccessToken(config);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(runBuilderJob({ ...config, projectId: "project", jobRegion: "region", jobName: "builder" }, token, { inputUri: "gs://input/job", outputUri: "gs://output/job" })).rejects.toMatchObject({ code: "job_run_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await getBuilderAccessToken(config);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("bounds completed token entries instead of retaining every identity", async () => {
    const { config, fetchMock } = await fixture();
    for (let i = 0; i < 17; i++) await getBuilderAccessToken({ ...config, builderServiceAccount: `builder-${i}@example.com` });
    await getBuilderAccessToken({ ...config, builderServiceAccount: "builder-0@example.com" });
    expect(fetchMock).toHaveBeenCalledTimes(36);
  });
});
