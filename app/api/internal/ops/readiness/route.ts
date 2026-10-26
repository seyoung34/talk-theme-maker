import { createAdminClient } from "@/lib/supabase/server";
import { readinessResponse } from "@/lib/ops/readiness";

export const dynamic = "force-dynamic";

// A separate READ-ONLY readiness credential cannot run drain/sweep operations.
export async function GET(request: Request) {
  return readinessResponse(request, process.env.MONITOR_READINESS_TOKEN, createAdminClient);
}
