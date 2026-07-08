import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Android APK 동기 내보내기는 Cloudflare 이전 중 임시로 비활성화되었습니다.", reason: "sync_android_export_disabled" },
    { status: 410 },
  );
}
