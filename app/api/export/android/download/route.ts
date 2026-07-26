import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/billing/credits";
import { resolveAndroidExportDownload } from "@/lib/theme/android/androidExportStatus";

/**
 * 완료된 Android 내보내기를 다시 받는다.
 *
 * `status` 엔드포인트는 빌드가 도는 동안 폴링하면서 작업을 정산하는 용도라, 마이페이지에서
 * "다시 받기"로 호출하기에는 의미가 어긋난다. 여기서는 정산하지 않고 소유권과 결과 파일 존재만
 * 확인한 뒤 짧은 TTL의 서명 URL을 새로 발급한다.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !uuidPattern.test(jobId)) {
    return NextResponse.json({ error: "jobId가 올바르지 않습니다.", reason: "invalid_job_id" }, { status: 400 });
  }

  try {
    const result = await resolveAndroidExportDownload(user.id, jobId);
    switch (result.kind) {
      case "not_found":
        return NextResponse.json({ error: "내보내기 작업을 찾을 수 없습니다.", reason: "not_found" }, { status: 404 });
      case "not_ready":
        return NextResponse.json({ error: "아직 내려받을 수 있는 결과가 없습니다.", reason: "not_ready" }, { status: 409 });
      case "expired":
        return NextResponse.json(
          { error: "보관 기간이 지나 결과 파일이 삭제됐습니다. 편집 화면에서 다시 내보내 주세요.", reason: "expired" },
          { status: 410 },
        );
      case "ready":
        return NextResponse.json({ downloadUrl: result.downloadUrl, fileName: result.fileName });
    }
  } catch (error) {
    console.error("[android-export] download_link_failed", error);
    return NextResponse.json({ error: "다운로드 링크를 발급하지 못했습니다.", reason: "download_link_failed" }, { status: 500 });
  }
}
