import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/billing/credits";
import { resolveAndroidExportStatus } from "@/lib/theme/android/androidExportStatus";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !uuidPattern.test(jobId)) {
    return NextResponse.json({ error: "jobId가 올바르지 않습니다.", reason: "invalid_job_id" }, { status: 400 });
  }

  try {
    const result = await resolveAndroidExportStatus(user.id, jobId);
    switch (result.kind) {
      case "not_found":
        return NextResponse.json({ error: "내보내기 작업을 찾을 수 없습니다.", reason: "not_found" }, { status: 404 });
      case "pending":
        return NextResponse.json({ status: "pending", stage: result.stage });
      case "completed":
        return NextResponse.json({ status: "completed", downloadUrl: result.downloadUrl, fileName: result.fileName });
      case "failed":
        return NextResponse.json({ status: "failed", error: result.error });
    }
  } catch (error) {
    console.error("[android-export] status_check_failed", error);
    return NextResponse.json({ error: "내보내기 상태를 확인하지 못했습니다.", reason: "status_check_failed" }, { status: 500 });
  }
}
