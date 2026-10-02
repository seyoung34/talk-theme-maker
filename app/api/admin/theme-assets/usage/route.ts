import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { readAdminAssetUsageIndex } from "@/lib/theme/server/adminAssetUsage";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getCurrentAdmin();
  if (!auth.configured || !auth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  try {
    return NextResponse.json(await readAdminAssetUsageIndex(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin asset usage lookup failed", error);
    return NextResponse.json({ error: "연결 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
