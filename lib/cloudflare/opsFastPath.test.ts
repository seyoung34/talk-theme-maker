// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFastPath, type FastPathEnvironment } from "./apiFastPath";
import { workerRequestEnvironment, withWorkerRequestEnvironment } from "./workerRequestEnvironment";
import { readBuilderConfig } from "@/lib/theme/export/buildJobClient";

// Any accidental Next request-runtime initialization breaks the fast path.
vi.mock("next/headers", () => { throw new Error("Next request runtime must not load"); });

const baseEnv: FastPathEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture",
  SUPABASE_SECRET_KEY: "server-fixture",
  OPS_NOTIFICATIONS_DRAIN_TOKEN: "ops-fixture",
  TELEGRAM_NOTIFICATIONS_ENABLED: "1",
  TELEGRAM_BOT_TOKEN: "123:abcdefghijklmnopqrstuvwxyz",
  TELEGRAM_CHAT_ID: "fixture-chat",
};
const paths = ["/api/internal/ops/telegram/drain", "/api/internal/ops/export/sweep"];
const request = (path: string, token = "ops-fixture") => new Request(`https://local.invalid${path}`, {
  method: "POST", headers: {"x-ops-notifications-token": token},
});
async function builderEnvironment() {
  const key = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  return {...baseEnv,GCP_PROJECT_ID:"fixture-project",GCP_PROJECT_NUMBER:"123",CLOUDFLARE_OIDC_ISSUER:"https://issuer.invalid",CLOUDFLARE_OIDC_PRIVATE_JWK:JSON.stringify({...await crypto.subtle.exportKey("jwk",key.privateKey),kid:"fixture"}),GCP_BUILDER_SA_EMAIL:"fixture@example.invalid",GCP_BUILD_INPUT_BUCKET:"input",GCP_BUILD_OUTPUT_BUCKET:"output",GCP_BUILD_JOB_REGION:"region",GCP_BUILD_JOB_NAME:"android",GCP_IOS_BUILD_JOB_NAME:"ios"};
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("maintenance fast paths", () => {
  it("preserves method and exact path fallback", () => {
    for (const path of paths) {
      for (const method of ["GET", "HEAD", "OPTIONS", "PUT"]) expect(apiFastPath(new Request(`https://local.invalid${path}`, {method}), baseEnv)).toBeUndefined();
      for (const suffix of ["/", "/child"]) expect(apiFastPath(request(path + suffix), baseEnv)).toBeUndefined();
    }
    expect(apiFastPath(request("/api/internal/ops/daily-summary"), baseEnv)).toBeUndefined();
  });

  it.each(paths)("authenticates %s before any database call using only explicit env", async path => {
    const outbound = vi.fn(); vi.stubGlobal("fetch", outbound);
    vi.stubEnv("OPS_NOTIFICATIONS_DRAIN_TOKEN", "process-token-must-not-authorize");
    for (const [env, token, status, reason] of [
      [{...baseEnv, OPS_NOTIFICATIONS_DRAIN_TOKEN: undefined}, "ops-fixture", 503, "configuration_missing"],
      [baseEnv, "process-token-must-not-authorize", 401, "unauthorized"],
    ] as const) {
      const response = await apiFastPath(request(path, token), env)!;
      expect(response.status).toBe(status); expect(await response.json()).toMatchObject({reason});
    }
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each(paths)("finishes empty %s with exactly one backend request", async path => {
    const outbound = vi.fn(async () => Response.json([])); vi.stubGlobal("fetch", outbound);
    const response = await apiFastPath(request(path), baseEnv)!;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(path.includes("telegram") ? {claimed:0,sent:0} : {scanned:0,failed:0});
    expect(outbound).toHaveBeenCalledTimes(1);
    const [url, options] = outbound.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).hostname).toBe("fixture.invalid");
    expect(new Headers(options.headers).get("apikey")).toBe("server-fixture");
    expect(workerRequestEnvironment()).toBeUndefined();
  });

  it.each(paths)("keeps the existing query failure contract for missing DB config in %s", async path => {
    const outbound = vi.fn(); vi.stubGlobal("fetch", outbound);
    // A process secret must never fill a missing Worker binding.
    vi.stubEnv("SUPABASE_SECRET_KEY", "must-not-use");
    const response = await apiFastPath(request(path), {...baseEnv,SUPABASE_SECRET_KEY:undefined})!;
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({reason:path.includes("telegram") ? "drain_failed" : "query_failed"});
    expect(outbound).not.toHaveBeenCalled();
  });

  it("keeps disabled Telegram as a 503 no-op without backend I/O", async () => {
    const outbound = vi.fn(); vi.stubGlobal("fetch", outbound);
    const response = await apiFastPath(request(paths[0]), {...baseEnv, TELEGRAM_NOTIFICATIONS_ENABLED:"0"})!;
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({reason:"disabled"});
    expect(outbound).not.toHaveBeenCalled();
  });

  it("isolates overlapping drain envs through awaits, DB clients, message formatting and delivery", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const firstStarted = new Promise<void>(resolve => { started = resolve; });
    const deliveries: {token:string;chat:string;text:string}[] = [];
    const outbound = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "api.telegram.org") {
        const body = JSON.parse(String(options?.body));
        deliveries.push({token:url.pathname,chat:body.chat_id,text:body.text});
        return Response.json({ok:true,result:{message_id:1}});
      }
      const tenant = url.hostname.split(".")[0];
      expect(new Headers(options?.headers).get("apikey")).toBe(`${tenant}-secret`);
      if (url.pathname.endsWith("claim_ops_notification_batch")) {
        if (tenant === "first") { started(); await gate; }
        return Response.json([{event_id:tenant,event_type:"export.failed",severity:"P2",source:"export",occurred_at:"2026-10-26T00:00:00Z",dedupe_key:tenant,attempt_count:1,lease_id:tenant,payload:{summary:tenant,details:{},adminPath:"/admin/exports"}}]);
      }
      expect(url.pathname).toBe("/rest/v1/rpc/mark_ops_notification_sent");
      return Response.json(true);
    });
    vi.stubGlobal("fetch", outbound);
    const env = (tenant: string) => ({...baseEnv, NEXT_PUBLIC_SUPABASE_URL:`https://${tenant}.invalid`,SUPABASE_SECRET_KEY:`${tenant}-secret`,TELEGRAM_BOT_TOKEN:`123:${tenant.padEnd(24,"x")}`,TELEGRAM_CHAT_ID:tenant,NEXT_PUBLIC_SITE_URL:`https://${tenant}.invalid`});
    const first = apiFastPath(request(paths[0]), env("first"))!;
    await firstStarted;
    expect((await (await apiFastPath(request(paths[0]), env("second"))!).json()).sent).toBe(1);
    release();
    expect((await (await first).json()).sent).toBe(1);
    expect(deliveries.map(d => d.chat)).toEqual(["second","first"]);
    for (const delivery of deliveries) {
      expect(delivery.token).toContain(delivery.chat);
      expect(delivery.text).toContain(`https://${delivery.chat}.invalid/admin/exports`);
      expect(delivery.text).not.toContain(delivery.chat === "first" ? "second.invalid" : "first.invalid");
    }
    expect(workerRequestEnvironment()).toBeUndefined();
  });

  it("reads nested GCP builder settings from the scoped env without process fallback", async () => {
    const env = await builderEnvironment();
    const config = withWorkerRequestEnvironment(env, undefined, () => readBuilderConfig({platform:"ios"}));
    expect(config).toMatchObject({projectId:"fixture-project",jobName:"ios",outputBucket:"output"});
    expect(() => withWorkerRequestEnvironment({...env,GCP_PROJECT_ID:undefined},undefined,()=>readBuilderConfig())).toThrow();
  });

  it.each(["success", "failed"])("settles a GCP %s result with scoped config and retains background failure alerts", async status => {
    const env = await builderEnvironment();
    const jobId = "11111111-2222-4333-8444-555555555555";
    const job = {id:jobId,user_id:"fixture-user",platform:"ios",status:"pending",stage:"building",created_at:new Date().toISOString()};
    const calls: string[] = [];
    const tasks: Promise<unknown>[] = [];
    const ctx = {waitUntil:vi.fn((task: Promise<unknown>) => {tasks.push(task);})};
    let eventPayload: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input)); calls.push(`${options?.method ?? "GET"} ${url.hostname}${url.pathname}`);
      if (url.hostname === "sts.googleapis.com") return Response.json({access_token:"federated"});
      if (url.hostname === "iamcredentials.googleapis.com") return Response.json({accessToken:"builder",expireTime:new Date(Date.now()+3600_000).toISOString()});
      if (url.hostname === "storage.googleapis.com") {
        expect(url.pathname).toContain("/b/output/");
        expect(new Headers(options?.headers).get("authorization")).toBe("Bearer builder");
        return Response.json(status === "success" ? {status,fileName:"fixture.ktheme",bytes:123} : {status,errorCode:"ios_export_failed"});
      }
      expect(url.hostname).toBe("fixture.invalid");
      expect(new Headers(options?.headers).get("apikey")).toBe("server-fixture");
      if (url.pathname === "/rest/v1/export_jobs") return Response.json(options?.method === "PATCH" ? {id:jobId} : url.searchParams.has("id") ? job : [job]);
      if (url.pathname.endsWith("complete_export_job")) {
        expect(JSON.parse(String(options?.body))).toMatchObject({p_file_name:"fixture.ktheme",p_output_bytes:123,p_user_id:"fixture-user"});
        return Response.json(1);
      }
      if (url.pathname.endsWith("fail_export_job_if_pending")) return Response.json({transitioned:true,status:"failed",balance:1});
      if (url.pathname.endsWith("enqueue_ops_event")) {
        eventPayload = JSON.parse(String(options?.body)).p_payload;
        return Response.json("inserted");
      }
      expect(url.pathname).toBe("/rest/v1/rpc/claim_ops_notification_batch");
      return Response.json([]);
    }));
    const response = await apiFastPath(request(paths[1]), env, ctx)!;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({scanned:1,terminal:1,failed:0});
    await Promise.all(tasks);
    expect(calls.some(call => call.includes("sts.googleapis.com"))).toBe(true);
    expect(calls.some(call => call.includes("signBlob"))).toBe(false);
    if (status === "failed") {
      expect(ctx.waitUntil).toHaveBeenCalledOnce();
      expect(eventPayload).toMatchObject({details:{route:paths[1],operation:"export.sweep",platform:"ios"}});
      expect(calls.at(-1)).toContain("claim_ops_notification_batch");
    } else expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(workerRequestEnvironment()).toBeUndefined();
  });
});
