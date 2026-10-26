// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { apiFastPath } from "./apiFastPath";
import nextError from "./fixtures/next-route-error.json";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-key",
  SUPABASE_SECRET_KEY: "fixture-service",
  MONITOR_READINESS_TOKEN: "r".repeat(32),
};
const user = {id:"u1",email:"user@example.invalid",user_metadata:{full_name:"Full Name",name:"Name"}};
function sessionCookie(expired = false) {
  const exp = expired ? 1 : 4102444800;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,exp})).toString("base64url")}.fixture`;
  const value = `base64-${Buffer.from(JSON.stringify({access_token:token,refresh_token:"refresh",expires_at:exp,user})).toString("base64url")}`;
  return `sb-fixture-auth-token=${value}`;
}
afterEach(() => {vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.doUnmock("next/headers");vi.resetModules();});

describe("session Next fallback / Worker HTTP contract with real Supabase SDK", () => {
  it.each(["anon","auth","admin","profile-error","admin-error","invalid","refresh","expired","missing-name","duplicate-cookie"])("matches %s", async scenario => {
    vi.resetModules();
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    try {
      for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
      const calls: string[]=[];
      vi.stubGlobal("fetch",vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url=new URL(input instanceof Request?input.url:String(input));
        calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if(url.hostname!=="fixture.invalid")throw new Error("outbound blocked");
        if(url.pathname==="/auth/v1/token")return Response.json(scenario==="expired"?{error:"invalid_grant",error_code:"refresh_token_not_found",msg:"expired"}:{access_token:`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,exp:4102444800})).toString("base64url")}.fixture`,refresh_token:"new-refresh",token_type:"bearer",expires_in:3600,user:{...user,user_metadata:{name:"x".repeat(5000)}}},{status:scenario==="expired"?400:200});
        if(url.pathname==="/auth/v1/user")return Response.json(scenario==="invalid"?{msg:"invalid",code:"bad_jwt"}:scenario==="missing-name"?{id:user.id,user_metadata:{}}:user,{status:scenario==="invalid"?401:200});
        if(url.pathname==="/rest/v1/profiles")return Response.json(scenario==="profile-error"?{message:"fixture failure"}:scenario==="missing-name"?null:{display_name:scenario==="refresh"?null:"Display"},{status:scenario==="profile-error"?500:200});
        if(url.pathname==="/rest/v1/admin_profiles")return Response.json(scenario==="admin-error"?{message:"fixture failure"}:scenario==="admin"?{user_id:user.id}:null,{status:scenario==="admin-error"?500:200});
        throw new Error(`Unexpected fixture: ${url}`);
      }));
      const cookie=scenario==="anon"?"consent=1":(scenario==="duplicate-cookie"?"sb-fixture-auth-token=invalid; ":"")+sessionCookie(scenario==="refresh"||scenario==="expired");
      const request=new NextRequest("https://local.invalid/api/session",{headers:{cookie}});
      const cookieResponse=new NextResponse();
      vi.doMock("next/headers",()=>({cookies:async()=>({getAll:()=>request.cookies.getAll(),set:(...args: Parameters<typeof cookieResponse.cookies.set>)=>cookieResponse.cookies.set(...args)})}));
      const {GET}=await import("../../app/api/session/route");
      const next=await GET();
      const before=[...calls];calls.length=0;
      const fast=await apiFastPath(request,env)!;
      expect(await fast.text()).toBe(await next.text());
      expect(fast.status).toBe(next.status);
      for(const header of ["content-type","cache-control","pragma","expires"])expect(fast.headers.get(header)).toBe(next.headers.get(header));
      const normalize=(headers:Headers)=>headers.getSetCookie().map(cookie=>cookie.split(";").map((part,index)=>index?part.trim().toLowerCase():part).toSorted().join(";")).toSorted();
      expect(normalize(fast.headers)).toEqual(normalize(cookieResponse.headers));
      expect(calls).toEqual(before);
      if(scenario==="anon")expect(calls).toHaveLength(0);
      if(scenario==="refresh")expect(fast.headers.getSetCookie().length).toBeGreaterThan(2);
      if(scenario==="expired")expect(fast.headers.getSetCookie().some(c=>c.includes("Max-Age=0"))).toBe(true);
    } finally {vi.useRealTimers();}
  });
});

it("passes all other methods and exact path mismatches to Next", () => {
  for(const method of ["POST","HEAD","OPTIONS"])expect(apiFastPath(new Request("https://local.invalid/api/session",{method}),env)).toBeUndefined();
  for(const path of ["/api/session/","/api/me","/api/internal/ops/readiness/child"])expect(apiFastPath(new Request(`https://local.invalid${path}`),env)).toBeUndefined();
});

it.each(["ok","unauthorized","unconfigured","error","throw"])("readiness matches fallback for %s", async scenario => {
  vi.resetModules();
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  if(scenario==="unconfigured")vi.stubEnv("MONITOR_READINESS_TOKEN","");
  if(scenario==="throw")vi.stubEnv("SUPABASE_SECRET_KEY","");
  const calls: {method: string;url:string;signal: AbortSignal | null | undefined}[]=[];
  vi.stubGlobal("fetch",vi.fn(async (input: RequestInfo | URL,init?:RequestInit)=>{
    calls.push({method:init?.method ?? "GET",url:String(input),signal:init?.signal});
    return new Response(null,{status:scenario==="error"?400:200});
  }));
  const request=new Request("https://local.invalid/api/internal/ops/readiness",{headers:{authorization:`Bearer ${scenario==="unauthorized"?"wrong":env.MONITOR_READINESS_TOKEN}`}});
  const {GET}=await import("../../app/api/internal/ops/readiness/route");
  const next=await GET(request);
  const fast=await apiFastPath(request,{...env,MONITOR_READINESS_TOKEN:process.env.MONITOR_READINESS_TOKEN,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY})!;
  expect(fast.status).toBe(next.status);expect(await fast.text()).toBe(await next.text());
  expect(fast.headers.get("cache-control")).toBe("no-store");
  for(const call of calls){expect(call.method).toBe("HEAD");expect(new URL(call.url).searchParams.get("limit")).toBe("1");expect(call.signal).toBeInstanceOf(AbortSignal);}
});

it.each(["/api/session","/api/internal/ops/readiness"])("bounds unexpected %s errors to the captured Next 500 without rerunning", async path => {
  const error = new Error("fixture-cookie-token-user-id-must-not-log");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const request = new Request(`https://local.invalid${path}`);
  const injection = path === "/api/session"
    ? vi.spyOn(Response, "json").mockImplementation(() => { throw error; })
    : vi.spyOn(request.headers, "get").mockImplementation(() => { throw error; });
  // Await must resolve: a rejection would otherwise escape Worker fetch as 1101.
  const response = await apiFastPath(request, env)!;
  expect(response.status).toBe(nextError.status);
  expect(await response.text()).toBe(nextError.body);
  expect(response.headers.get("cache-control")).toBe(nextError.cacheControl);
  expect(response.headers.get("content-type")).toBe(nextError.contentType);
  expect(response.headers.get("vary")).toBe(nextError.vary);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(injection).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledExactlyOnceWith(path === "/api/session" ? "Session request failed" : "Readiness request failed");
});
