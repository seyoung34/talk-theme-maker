import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readinessResponse } from "../ops/readiness";
import { sessionResponse } from "../supabase/sessionResponse";

export type FastPathEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  MONITOR_READINESS_TOKEN?: string;
};

function browserConfig(env: FastPathEnvironment) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return { url, key };
}

async function session(request: Request, env: FastPathEnvironment) {
  // Next RequestCookies uses the last duplicate name; cookie.parse uses first.
  const cookieList = parseCookieHeader((request.headers.get("cookie") ?? "").split(";").reverse().join(";")).map(({name,value}) => ({name,value:value ?? ""}));
  // Match Next's per-name cookie replacement while retaining every refreshed chunk.
  const updates = new Map<string, { value: string; options: CookieOptions }>();
  const response = await sessionResponse(cookieList, () => {
    const { url, key } = browserConfig(env);
    return createServerClient(url, key, {
      cookies: {
        getAll: () => cookieList,
        setAll: cookies => {
          for (const {name,value,options} of cookies) updates.set(name, {value,options});
        },
      },
    });
  });
  for (const [name,{value,options}] of updates) {
    response.headers.append("set-cookie", serializeCookieHeader(name, value, {
      ...options, path: options.path ?? "/",
      ...(options.maxAge ? {expires:new Date(Date.now() + options.maxAge * 1000)} : {}),
    }));
  }
  return response;
}

// No next/*, React, generated Next code, or request-scoped globals.
// Other methods retain Next's HEAD/OPTIONS/405 and routing behavior.
export function apiFastPath(request: Request, env: FastPathEnvironment): Promise<Response> | undefined {
  if (request.method !== "GET") return undefined;
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/internal/ops/readiness") {
    return readinessResponse(request, env.MONITOR_READINESS_TOKEN, () => {
      const { url } = browserConfig(env);
      if (!env.SUPABASE_SECRET_KEY) throw new Error("Supabase server configuration is missing. Set SUPABASE_SECRET_KEY.");
      return createClient(url, env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
    });
  }
  if (pathname === "/api/session") return session(request, env);
  return undefined;
}
