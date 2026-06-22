import { NextResponse } from "next/server";
import { getAndroidSampleVersionName } from "@/lib/theme/android/apk";
import { handleAndroidExportRequest } from "@/lib/theme/android/exportRoute";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ versionName: await getAndroidSampleVersionName() });
  } catch (error) {
    console.error("[android-export] sample_version_read_failed", error);
    return NextResponse.json({ error: "Android 빌드 설정을 읽지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleAndroidExportRequest(request);
}
