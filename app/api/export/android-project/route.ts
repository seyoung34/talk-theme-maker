import { handleAndroidExportRequest } from "@/lib/theme/android/exportRoute";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleAndroidExportRequest(request, { forcedMode: "project", exportNameField: "projectBaseName" });
}
