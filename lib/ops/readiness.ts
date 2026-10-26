import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Framework-independent: the Worker and Next fallback use exactly the same probe.
export async function readinessResponse(request: Request, token: string | undefined, createAdmin: () => SupabaseClient) {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return new Response('{"ready":false}', { status: 503, headers });
  const suppliedBytes = Buffer.from(request.headers.get("authorization") ?? "");
  const expectedBytes = Buffer.from(`Bearer ${token}`);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return new Response('{"ready":false}', { status: 401, headers });
  }
  try {
    const { error } = await createAdmin().from("export_jobs").select("id", { head: true }).limit(1).abortSignal(AbortSignal.timeout(3000));
    return new Response(JSON.stringify(error ? { ready: false, reason: "database_unavailable" } : { ready: true }), { status: error ? 503 : 200, headers });
  } catch {
    return new Response('{"ready":false,"reason":"database_unavailable"}', { status: 503, headers });
  }
}
