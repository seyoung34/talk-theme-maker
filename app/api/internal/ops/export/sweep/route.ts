import { NextResponse } from "next/server";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveExportStatus, type AsyncExportPlatform } from "@/lib/theme/export/asyncExportStatus";

const maxSweepJobs = 10;

export const dynamic = "force-dynamic";

type PendingExportJob = {
  id: string;
  user_id: string;
  platform: AsyncExportPlatform;
};

export async function POST(request: Request) {
  const auth = authorizeOpsInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "configuration_missing" ? "export sweep이 설정되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: auth.reason === "configuration_missing" ? 503 : 401 },
    );
  }

  let data: unknown[] | null = null;
  try {
    const admin = createAdminClient();
    const result = await admin
      .from("export_jobs")
      .select("id,user_id,platform")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(maxSweepJobs);
    data = result.data as unknown[] | null;
    if (result.error) throw result.error;
  } catch (error) {
    console.error("[export-sweep] query_failed", { name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "export sweep 대상을 읽지 못했습니다.", reason: "query_failed" }, { status: 500 });
  }

  const jobs = (data ?? []).filter(isPendingExportJob);
  let terminal = 0;
  let stillPending = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await resolveExportStatus(job.user_id, job.id, job.platform);
      if (result.kind === "completed" || result.kind === "failed") terminal += 1;
      else if (result.kind === "pending") stillPending += 1;
    } catch (error) {
      failed += 1;
      console.error("[export-sweep] job_failed", {
        exportJobId: job.id,
        platform: job.platform,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return NextResponse.json({
    scanned: jobs.length,
    terminal,
    stillPending,
    failed,
    truncated: (data ?? []).length >= maxSweepJobs,
  });
}

function isPendingExportJob(value: unknown): value is PendingExportJob {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.user_id === "string"
    && (value.platform === "android" || value.platform === "ios");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
