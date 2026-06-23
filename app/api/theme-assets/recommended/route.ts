import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const bucketName = "theme-assets";
const allowedPlatforms = new Set(["android", "ios"]);
const allowedAssetKinds = new Set(["background", "icon", "bubble", "profile", "launcher", "passcode"]);

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    const assetKind = request.nextUrl.searchParams.get("assetKind");
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 24));
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));

    if (!platform || !allowedPlatforms.has(platform) || !assetKind || !allowedAssetKinds.has(assetKind)) {
      return NextResponse.json({ error: "올바른 플랫폼과 에셋 종류가 필요합니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("admin_assets")
      .select("id,slot_role,platform,asset_kind,analysis,bubble_adjustment,title,note,tags,file_name,mime_type,storage_path,enabled,created_at,updated_at")
      .eq("enabled", true)
      .in("platform", [platform, "all"])
      .eq("asset_kind", assetKind)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.or(`updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const signedUrls = new Map<string, string>();

    if (pageRows.length > 0) {
      const { data: signedData, error: signedError } = await admin.storage
        .from(bucketName)
        .createSignedUrls(pageRows.map((row) => row.storage_path), 60 * 10);
      if (signedError) throw signedError;
      for (const item of signedData ?? []) {
        if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
      }
    }

    const last = pageRows.at(-1);

    return NextResponse.json({
      items: pageRows.map((row) => ({
        id: row.id,
        slotRole: row.slot_role,
        platform: row.platform,
        assetKind: row.asset_kind,
        analysis: row.analysis,
        bubbleAdjustment: row.bubble_adjustment,
        title: row.title,
        note: row.note,
        tags: row.tags ?? [],
        fileName: row.file_name,
        mimeType: row.mime_type,
        storagePath: row.storage_path,
        previewUrl: signedUrls.get(row.storage_path),
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        enabled: true,
      })),
      nextCursor: hasMore && last ? `${last.updated_at}|${last.id}` : undefined,
    });
  } catch (error) {
    console.error("Recommended asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "추천 에셋을 불러오지 못했습니다." }, { status: 500 });
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { message: value.message, code: value.code, details: value.details, hint: value.hint, status: value.status };
  }
  return { message: String(error) };
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return /^[0-9a-f-]{36}$/i.test(id) && Number.isFinite(new Date(updatedAt).getTime()) ? { updatedAt, id } : null;
}
