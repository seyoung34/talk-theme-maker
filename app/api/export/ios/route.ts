import { NextResponse } from "next/server";
import { createPendingExportJob, exportCreditCost, getCreditBalance, getCurrentUserOrNull, isInsufficientCreditsError, markExportFailed, spendCreditForExport } from "@/lib/billing/credits";
import { createStoredZip } from "@/lib/theme/project/zip";

export const runtime = "nodejs";
export const maxDuration = 60;

type UploadManifest = Array<{
  field: string;
  path: string;
}>;

type ExportMode = "theme-zip" | "ktheme";

export async function GET() {
  return NextResponse.json({ versionName: "1.0.0" });
}

export async function POST(request: Request) {
  let exportJobId: string | null = null;
  try {
    const user = await getCurrentUserOrNull();
    if (!user) return NextResponse.json({ error: "Login required.", reason: "unauthenticated" }, { status: 401 });

    const formData = await request.formData();
    const manifestRaw = formData.get("manifest");
    const exportNameRaw = formData.get("exportName");
    const versionNameRaw = formData.get("versionName");
    const modeRaw = formData.get("mode");

    if (typeof manifestRaw !== "string") {
      return NextResponse.json({ error: "Missing upload manifest." }, { status: 400 });
    }

    const mode = isExportMode(modeRaw) ? modeRaw : "ktheme";
    const balance = await getCreditBalance(user.id);
    if (balance < exportCreditCost) {
      return NextResponse.json({ error: "Insufficient credits.", reason: "insufficient_credits", credits: balance, required: exportCreditCost }, { status: 402 });
    }
    exportJobId = await createPendingExportJob({ userId: user.id, platform: "ios", mode });

    const exportName = typeof exportNameRaw === "string" && exportNameRaw.trim().length > 0 ? exportNameRaw.trim() : "kakaotalk-theme";
    const versionName = typeof versionNameRaw === "string" && versionNameRaw.trim().length > 0 ? versionNameRaw.trim() : "1.0.0";
    const manifest = JSON.parse(manifestRaw) as UploadManifest;

    const entries = [];
    for (const item of manifest) {
      const file = formData.get(item.field);
      if (!(file instanceof File)) {
        return NextResponse.json({ error: `Missing file for ${item.path}` }, { status: 400 });
      }
      entries.push({
        path: item.path,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }

    const zipBlob = createStoredZip(entries);
    const bytes = new Uint8Array(await zipBlob.arrayBuffer());
    const fileName = `${buildExportBaseName(exportName, versionName)}.${mode === "ktheme" ? "ktheme" : "zip"}`;
    const credits = await spendCreditForExport({ userId: user.id, exportJobId, fileName, reason: `ios_${mode}_export` });

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mode === "ktheme" ? "application/octet-stream" : "application/zip",
        "Content-Disposition": buildContentDisposition(fileName),
        "X-Credits-Remaining": String(credits),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "iOS export failed.";
    if (exportJobId) await markExportFailed(exportJobId, message);
    if (isInsufficientCreditsError(error)) {
      return NextResponse.json({ error: "Insufficient credits.", reason: "insufficient_credits" }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isExportMode(value: FormDataEntryValue | null): value is ExportMode {
  return value === "theme-zip" || value === "ktheme";
}

function buildExportBaseName(name: string, versionName: string) {
  const cleanName = sanitizeFileName(name) || "kakaotalk-theme";
  const cleanVersion = sanitizeFileName(versionName) || "1.0.0";
  return `${cleanName}_${cleanVersion}`;
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildContentDisposition(fileName: string) {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]+/g, "-");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
