import { NextResponse } from "next/server";
import { checkThemeAssetStorageAccess, getThemeAssetAccessContext, normalizeThemeAssetStoragePaths, themeAssetSignedUrlTtlSeconds } from "@/lib/theme/server/themeAssetAccess";

const bucketName = "theme-assets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paths?: unknown };
    const normalized = normalizeThemeAssetStoragePaths(body.paths);
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: normalized.status });

    const context = await getThemeAssetAccessContext();
    const access = await checkThemeAssetStorageAccess(normalized.paths, context);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const { data, error } = await context.adminClient.storage
      .from(bucketName)
      .createSignedUrls(normalized.paths, themeAssetSignedUrlTtlSeconds);
    if (error) throw error;

    const signedUrls = Object.fromEntries((data ?? []).filter((item) => item.path && item.signedUrl).map((item) => [item.path, item.signedUrl]));
    return NextResponse.json({ signedUrls });
  } catch (error) {
    console.error("Theme asset signed URL batch creation failed.", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signed URL 생성에 실패했습니다." }, { status: 500 });
  }
}
