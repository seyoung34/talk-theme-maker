import { NextResponse } from "next/server";
import { createPendingExportJob, exportCreditCost, getCreditBalance, getCurrentUserOrNull, isInsufficientCreditsError, markExportFailed, spendCreditForExport } from "@/lib/billing/credits";
import { exportAndroidProjectZip, type AndroidBuildInputFile } from "@/lib/theme/android/apk";

export const runtime = "nodejs";
export const maxDuration = 300;

type UploadManifest = Array<{
  field: string;
  path: string;
}>;

export async function POST(request: Request) {
  let exportJobId: string | null = null;
  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "Login required.", reason: "unauthenticated" }, { status: 401 });

    const formData = await request.formData();
    const manifestRaw = formData.get("manifest");
    const projectBaseNameRaw = formData.get("projectBaseName");
    const versionNameRaw = formData.get("versionName");
    const applicationIdRaw = formData.get("applicationId");

    if (typeof manifestRaw !== "string") {
      return NextResponse.json({ error: "Missing upload manifest." }, { status: 400 });
    }

    const manifest = JSON.parse(manifestRaw) as UploadManifest;
    const projectBaseName = typeof projectBaseNameRaw === "string" && projectBaseNameRaw.trim().length > 0 ? projectBaseNameRaw : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim().length > 0 ? versionNameRaw.trim() : undefined;
    const applicationId = typeof applicationIdRaw === "string" && applicationIdRaw.trim().length > 0 ? applicationIdRaw.trim() : undefined;
    const balance = await getCreditBalance(user.id);
    if (balance < exportCreditCost) {
      return NextResponse.json({ error: "Insufficient credits.", reason: "insufficient_credits", credits: balance, required: exportCreditCost }, { status: 402 });
    }
    exportJobId = await createPendingExportJob({ userId: user.id, platform: "android", mode: "project" });

    const files: AndroidBuildInputFile[] = [];
    for (const item of manifest) {
      const file = formData.get(item.field);
      if (!(file instanceof File)) {
        return NextResponse.json({ error: `Missing file for ${item.path}` }, { status: 400 });
      }
      files.push({
        path: item.path,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }

    const { zipBytes, fileName } = await exportAndroidProjectZip(files, projectBaseName, { versionName, applicationId });
    const credits = await spendCreditForExport({ userId: user.id, exportJobId, fileName, reason: "android_project_export" });
    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildContentDisposition(fileName),
        "X-Credits-Remaining": String(credits),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Android project export failed.";
    if (exportJobId) await markExportFailed(exportJobId, message);
    if (isInsufficientCreditsError(error)) {
      return NextResponse.json({ error: "Insufficient credits.", reason: "insufficient_credits" }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "-");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
