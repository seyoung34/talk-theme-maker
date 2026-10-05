import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { allowedAssetKinds, legacyAssetKind, readAdminAssetList } from "@/lib/theme/server/adminAssetList";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const assetKind = request.nextUrl.searchParams.get("assetKind");
  if (!assetKind || (!allowedAssetKinds.has(assetKind) && assetKind !== legacyAssetKind)) {
    return NextResponse.json({ error: "assetKind가 올바르지 않습니다." }, { status: 400 });
  }
  try {
    return NextResponse.json(await readAdminAssetList(assetKind), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin asset listing failed", JSON.stringify(serializeError(error)));
    return NextResponse.json({ error: "관리 후보를 불러오지 못했습니다." }, { status: 500 });
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
