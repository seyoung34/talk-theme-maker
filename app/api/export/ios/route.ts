import { NextResponse } from "next/server";
import { handleAsyncIosExportRequest } from "@/lib/theme/ios/exportRouteAsync";
import { themeVersionName } from "@/lib/theme/exportRequest";

// 편집기는 더 이상 이 값을 읽지 않는다(버전 입력을 없앴다). 배포 교체 중 남아 있는 예전
// 번들이 이 엔드포인트를 부르므로 응답 형태를 유지한다.
export async function GET() {
  return NextResponse.json({ versionName: themeVersionName });
}

export async function POST(request: Request) {
  return handleAsyncIosExportRequest(request);
}
