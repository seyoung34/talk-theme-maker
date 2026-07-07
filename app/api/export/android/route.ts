import { NextResponse } from "next/server";
import { handleAsyncAndroidExportRequest } from "@/lib/theme/android/exportRouteAsync";

export async function GET() {
  return NextResponse.json({ versionName: "1.0.0" });
}

export async function POST(request: Request) {
  return handleAsyncAndroidExportRequest(request);
}
