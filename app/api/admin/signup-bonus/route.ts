import { NextResponse } from "next/server";
import { getSignupBonusCampaign, updateSignupBonusCampaignStatus } from "@/lib/billing/signupBonusAdmin";
import { getCurrentAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

type UpdateBody = { status?: "active" | "inactive" };

export async function GET() {
  const authError = await requireAdminApi();
  if (authError) return authError;

  try {
    const campaign = await getSignupBonusCampaign();
    if (!campaign) return NextResponse.json({ error: "가입 혜택 캠페인을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load signup bonus campaign.", error);
    return NextResponse.json({ error: "가입 혜택 캠페인을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ error: "변경할 캠페인 상태가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const campaign = await updateSignupBonusCampaignStatus(body.status);
    if (!campaign) return NextResponse.json({ error: "가입 혜택 캠페인을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ campaign }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update signup bonus campaign.", error);
    return NextResponse.json({ error: "가입 혜택 캠페인 상태를 변경하지 못했습니다." }, { status: 500 });
  }
}

async function requireAdminApi() {
  const admin = await getCurrentAdmin();
  if (!admin.configured || !admin.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!admin.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  return null;
}
