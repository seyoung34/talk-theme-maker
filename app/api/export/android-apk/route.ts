import { NextResponse } from "next/server";
import { buildAndroidApk, type AndroidBuildInputFile } from "@/lib/theme/android/apk";

export const runtime = "nodejs";
export const maxDuration = 300;

type UploadManifest = Array<{
  field: string;
  path: string;
}>;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const manifestRaw = formData.get("manifest");
    const apkBaseNameRaw = formData.get("apkBaseName");
    const versionNameRaw = formData.get("versionName");
    const applicationIdRaw = formData.get("applicationId");

    if (typeof manifestRaw !== "string") {
      return NextResponse.json({ error: "Missing upload manifest." }, { status: 400 });
    }

    const manifest = JSON.parse(manifestRaw) as UploadManifest;
    const apkBaseName = typeof apkBaseNameRaw === "string" && apkBaseNameRaw.trim().length > 0 ? apkBaseNameRaw : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim().length > 0 ? versionNameRaw.trim() : undefined;
    const applicationId = typeof applicationIdRaw === "string" && applicationIdRaw.trim().length > 0 ? applicationIdRaw.trim() : undefined;

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

    const { apkBytes, fileName } = await buildAndroidApk(files, apkBaseName, { versionName, applicationId });
    return new NextResponse(apkBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": buildContentDisposition(fileName),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Android APK build failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "-");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
