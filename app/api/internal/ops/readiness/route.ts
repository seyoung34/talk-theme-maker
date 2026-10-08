import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A separate READ-ONLY readiness credential cannot run drain/sweep operations.
export async function GET(request: Request) {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  const token = process.env.MONITOR_READINESS_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return new Response('{"ready":false}', { status: 503, headers });
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return new Response('{"ready":false}', { status: 401, headers });
  }
  try {
    // HEAD + LIMIT 1 tests actual Data API/table access without returning data,
    // counting the table or exercising export/billing mutations.
    const { error } = await createAdminClient().from("export_jobs").select("id", { head: true }).limit(1).abortSignal(AbortSignal.timeout(3000));
    return new Response(JSON.stringify(error ? { ready: false, reason: "database_unavailable" } : { ready: true }), { status: error ? 503 : 200, headers });
  } catch {
    return new Response('{"ready":false,"reason":"database_unavailable"}', { status: 503, headers });
  }
}
