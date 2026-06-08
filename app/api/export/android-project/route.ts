import { NextResponse } from "next/server";
import { exportAndroidProjectZip, type AndroidBuildInputFile } from "@/lib/theme/android/apk";

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
    const projectBaseNameRaw = formData.get("projectBaseName");

    if (typeof manifestRaw !== "string") {
      return NextResponse.json({ error: "Missing upload manifest." }, { status: 400 });
    }

    const manifest = JSON.parse(manifestRaw) as UploadManifest;
    const projectBaseName = typeof projectBaseNameRaw === "string" && projectBaseNameRaw.trim().length > 0 ? projectBaseNameRaw : "kakaotalk-theme";

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

    const { zipBytes, fileName } = await exportAndroidProjectZip(files, projectBaseName);
    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": buildContentDisposition(fileName),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Android project export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]+/g, "-");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
