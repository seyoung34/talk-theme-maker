import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import type { BuilderConfig } from "@/lib/theme/export/buildJobClient";

const state = vi.hoisted(() => ({ calls: 0, recover: false, twoPlatforms: false, config: {} as BuilderConfig }));
vi.mock("@/lib/ops/internalAuth", () => ({ authorizeOpsInternalRequest: () => ({ ok: true }) }));
vi.mock("@/lib/theme/export/buildJobClient", async (original) => ({ ...await original<typeof import("@/lib/theme/export/buildJobClient")>(), readBuilderConfig: (options: { platform: string }) => options.platform === "ios" ? { ...state.config, builderServiceAccount: "ios@example.com", jobName: "ios-builder" } : state.config }));
vi.mock("@/lib/ops/dispatcher", () => ({
  // Enqueue + claim + send + mark sent + mark retry if the mark-sent RPC fails.
  scheduleOpsEvent: () => { state.calls += 5; },
}));
vi.mock("@/lib/billing/credits", () => ({
  completeExportJob: async () => { state.calls++; },
  failExportJobIfPending: async () => { state.calls++; return { transitioned: true, status: "failed" }; },
  claimExportRecovery: async () => { state.calls++; return { claimed: true, enqueueAttempt: 1 }; },
  updateExportJobEnqueueState: async () => { state.calls++; throw new Error("update failed"); },
  cancelExportJob: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: () => {
  let id = "";
  let update = false;
  const query = {
    select: () => query, order: () => query,
    eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
    update: () => { update = true; return query; },
    limit: async () => { state.calls++; return { data: ["job-1", "job-2"].map((id) => ({ id, user_id: "user", platform: state.twoPlatforms && id === "job-2" ? "ios" : "android" })), error: null }; },
    maybeSingle: async () => {
      state.calls++;
      return { error: null, data: update ? { id } : {
        id, user_id: "user", platform: state.twoPlatforms && id === "job-2" ? "ios" : "android", status: "pending", stage: "queued", file_name: null,
        created_at: new Date(Date.now() - (state.recover ? 11 * 60_000 : 10_000)).toISOString(),
        enqueue_state: "input_ready", enqueue_attempt: 0,
      } };
    },
  };
  return query;
} }) }));

beforeEach(async () => {
  state.calls = 0;
  state.recover = false;
  state.twoPlatforms = false;
  const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  state.config = {
    projectId: "project", jobRegion: "region", jobName: "builder", inputBucket: "input", outputBucket: "output",
    builderServiceAccount: "builder@example.com", wifAudience: "audience", oidcIssuer: "issuer", oidcSubject: "subject",
    oidcPrivateJwk: { ...await crypto.subtle.exportKey("jwk", key.privateKey), kid: "test" },
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    state.calls++;
    const url = new URL(String(input));
    const json = (value: unknown) => new Response(JSON.stringify(value));
    if (url.hostname === "sts.googleapis.com") return json({ access_token: "federated" });
    if (url.hostname === "iamcredentials.googleapis.com") return json({ accessToken: "builder", expireTime: new Date(Date.now() + 3600_000).toISOString() });
    if (url.pathname.includes("result.json")) return state.recover ? new Response(null, { status: 404 }) : json({ status: "success", fileName: "theme.apk", bytes: 123 });
    if (url.pathname.endsWith("executions")) {
      const page = Number(url.searchParams.get("pageToken") ?? 1);
      return json({ executions: [], ...(page < 5 ? { nextPageToken: String(page + 1) } : {}) });
    }
    if (url.pathname.includes("bundle.json")) return json({ manifest: [] });
    if (url.searchParams.has("prefix")) return json({ items: [{ name: `${url.searchParams.get("prefix")}bundle.json` }] });
    if (url.pathname.endsWith(":run")) return json({ name: "operation" });
    throw new Error(`Unexpected fixture URL ${url.pathname}`);
  }));
});

describe("sweep external request budget fixtures", () => {
  it("uses 11 cold / 9 warm requests to settle two successes without signing", async () => {
    expect((await POST(new Request("https://internal", { method: "POST" }))).status).toBe(200);
    expect(state.calls).toBe(11);
    state.calls = 0;
    await POST(new Request("https://internal", { method: "POST" }));
    expect(state.calls).toBe(9);
  });

  it("keeps paginated recovery plus trigger/update failure and alerts under 50", async () => {
    state.recover = true;
    state.twoPlatforms = true;
    const response = await POST(new Request("https://internal", { method: "POST" }));
    expect(await response.json()).toMatchObject({ terminal: 2, failed: 0 });
    expect(state.calls).toBe(43);
    expect(state.calls).toBeLessThan(50);
  });
});
