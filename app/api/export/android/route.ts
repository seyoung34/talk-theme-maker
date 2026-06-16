import { NextResponse } from "next/server";
import { buildAndroidApk, exportAndroidApkZip, exportAndroidProjectZip, getAndroidSampleVersionName, type AndroidBuildInputFile } from "@/lib/theme/android/apk";

export const runtime = "nodejs";
export const maxDuration = 300;

type UploadManifest = Array<{
  field: string;
  path: string;
}>;

type ExportMode = "project" | "apk" | "apk-zip";

export async function GET() {
  try {
    const versionName = await getAndroidSampleVersionName();
    return NextResponse.json({ versionName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read Android sample config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const manifestRaw = formData.get("manifest");
    const exportNameRaw = formData.get("exportName");
    const versionNameRaw = formData.get("versionName");
    const applicationIdRaw = formData.get("applicationId");
    const modeRaw = formData.get("mode");

    if (typeof manifestRaw !== "string") {
      return NextResponse.json({ error: "Missing upload manifest." }, { status: 400 });
    }

    const mode = isExportMode(modeRaw) ? modeRaw : "apk";
    const exportName = typeof exportNameRaw === "string" && exportNameRaw.trim().length > 0 ? exportNameRaw.trim() : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim().length > 0 ? versionNameRaw.trim() : undefined;
    const applicationId = typeof applicationIdRaw === "string" && applicationIdRaw.trim().length > 0 ? applicationIdRaw.trim() : undefined;
    const manifest = JSON.parse(manifestRaw) as UploadManifest;

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

    if (mode === "project") {
      const { zipBytes, fileName } = await exportAndroidProjectZip(files, exportName, { versionName, applicationId });
      return new NextResponse(zipBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": buildContentDisposition(fileName),
        },
      });
    }

    if (mode === "apk-zip") {
      const { zipBytes, fileName } = await exportAndroidApkZip(files, exportName, { versionName, applicationId });
      return new NextResponse(zipBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": buildContentDisposition(fileName),
        },
      });
    }

    const { apkBytes, fileName } = await buildAndroidApk(files, exportName, { versionName, applicationId });
    return new NextResponse(apkBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": buildContentDisposition(fileName),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Android export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isExportMode(value: FormDataEntryValue | null): value is ExportMode {
  return value === "project" || value === "apk" || value === "apk-zip";
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "-");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
