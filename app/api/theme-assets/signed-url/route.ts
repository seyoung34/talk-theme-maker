import { NextResponse } from "next/server";
import { checkThemeAssetStorageAccess, getThemeAssetAccessContext, isInvalidThemeAssetStoragePath, themeAssetSignedUrlTtlSeconds } from "@/lib/theme/server/themeAssetAccess";

const bucketName = "theme-assets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { path } = (await request.json()) as { path?: unknown };
    if (typeof path !== "string" || !path || isInvalidThemeAssetStoragePath(path)) {
      return NextResponse.json({ error: "올바른 Storage 경로가 필요합니다." }, { status: 400 });
    }

    const context = await getThemeAssetAccessContext();
    const access = await checkThemeAssetStorageAccess([path], context);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const { data, error } = await context.adminClient.storage
      .from(bucketName)
      .createSignedUrl(path, themeAssetSignedUrlTtlSeconds);
    if (error) throw error;

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    console.error("Theme asset signed URL creation failed.", error);
    return NextResponse.json({ error: "Signed URL 생성에 실패했습니다.", reason: "signed_url_failed" }, { status: 500 });
  }
}
