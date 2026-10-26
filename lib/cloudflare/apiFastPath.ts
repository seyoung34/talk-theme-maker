import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { readinessResponse } from "../ops/readiness";
import { sessionResponse } from "../supabase/sessionResponse";
import { exportSweepResponse } from "../ops/exportSweepResponse";
import { telegramDrainResponse } from "../ops/telegramDrainResponse";
import { withWorkerRequestEnvironment, type WorkerRequestContext } from "./workerRequestEnvironment";

export type FastPathEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  MONITOR_READINESS_TOKEN?: string;
  OPS_NOTIFICATIONS_DRAIN_TOKEN?: string;
  TELEGRAM_NOTIFICATIONS_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  [name: string]: string | undefined;
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

// No Next request runtime, React or generated handler executes on these paths.
// Unhandled methods retain Next's HEAD/OPTIONS/405 and routing behavior.
export function apiFastPath(request: Request, env: FastPathEnvironment, ctx?: WorkerRequestContext): Promise<Response> | undefined {
  if (request.method === "POST") {
    const pathname = new URL(request.url).pathname;
    const handle = pathname === "/api/internal/ops/telegram/drain" ? telegramDrainResponse
      : pathname === "/api/internal/ops/export/sweep" ? exportSweepResponse : undefined;
    if (!handle) return undefined;
    return withWorkerRequestEnvironment(env, ctx, () => handle(request, env));
  }
  if (request.method !== "GET") return undefined;
  const pathname = new URL(request.url).pathname;
  let response: Promise<Response>;
  if (pathname === "/api/internal/ops/readiness") {
    response = readinessResponse(request, env.MONITOR_READINESS_TOKEN, () => {
      const { url } = browserConfig(env);
      if (!env.SUPABASE_SECRET_KEY) throw new Error("Supabase server configuration is missing. Set SUPABASE_SECRET_KEY.");
      return createClient(url, env.SUPABASE_SECRET_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
    });
  } else if (pathname === "/api/session") {
    response = session(request, env);
  } else return undefined;
  return response.catch(() => {
    // Match the measured production-mode Next route error contract. Never retry
    // through Next: a failed session request may already have rotated tokens.
    console.error(pathname === "/api/session" ? "Session request failed" : "Readiness request failed");
    return new Response(null, {
      status: 500,
      headers: {
        "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
        vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
      },
    });
  });
}
