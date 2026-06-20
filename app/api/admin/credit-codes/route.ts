import { NextResponse } from "next/server";
import { createCreditCodePreview, generateCreditCode, hashCreditCode, isValidCreditCode, normalizeCreditCode } from "@/lib/billing/creditCodes.server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/server";

type CreateBody = {
  mode?: "manual" | "automatic";
  code?: string;
  name?: string;
  credits?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
};

export async function GET() {
  const authError = await requireAdminApi();
  if (authError) return authError;
  const admin = createAdminClient();
  const { data, error } = await admin.from("credit_grant_codes").select("id,code_preview,name,credits,status,starts_at,expires_at,max_redemptions,redemption_count,created_at,updated_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "지급 코드 목록을 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(request: Request) {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const validationError = validateCreateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = body.mode === "manual" ? normalizeCreditCode(body.code ?? "") : generateCreditCode();
    const { data, error } = await admin
      .from("credit_grant_codes")
      .insert({
        code_hash: hashCreditCode(code),
        code_preview: createCreditCodePreview(code),
        name: body.name!.trim(),
        credits: body.credits,
        starts_at: body.startsAt || null,
        expires_at: body.expiresAt || null,
        max_redemptions: body.maxRedemptions ?? null,
        created_by: adminAuth.user.id,
      })
      .select("id,code_preview,name,credits,status,starts_at,expires_at,max_redemptions,redemption_count,created_at,updated_at")
      .single();

    if (!error && data) return NextResponse.json({ code, item: data }, { status: 201 });
    if (error?.code !== "23505" || body.mode === "manual") {
      return NextResponse.json({ error: error?.code === "23505" ? "이미 사용 중인 코드입니다." : "지급 코드를 생성하지 못했습니다." }, { status: error?.code === "23505" ? 409 : 500 });
    }
  }
  return NextResponse.json({ error: "고유 코드를 생성하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
}

async function requireAdminApi() {
  const admin = await getCurrentAdmin();
  if (!admin.configured || !admin.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!admin.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  return null;
}

function validateCreateBody(body: CreateBody) {
  if (body.mode !== "manual" && body.mode !== "automatic") return "코드 생성 방식을 선택해 주세요.";
  if (body.mode === "manual" && !isValidCreditCode(body.code ?? "")) return "코드는 영문, 숫자, 하이픈을 사용해 4~32자로 입력해 주세요.";
  if (!body.name?.trim() || body.name.trim().length > 80) return "캠페인 이름을 1~80자로 입력해 주세요.";
  if (!Number.isInteger(body.credits) || body.credits! < 1 || body.credits! > 100) return "지급 크레딧은 1~100 사이의 정수로 입력해 주세요.";
  if (body.maxRedemptions != null && (!Number.isInteger(body.maxRedemptions) || body.maxRedemptions < 1)) return "전체 사용 한도는 1 이상의 정수로 입력해 주세요.";
  const startsAt = body.startsAt ? Date.parse(body.startsAt) : null;
  const expiresAt = body.expiresAt ? Date.parse(body.expiresAt) : null;
  if (body.startsAt && Number.isNaN(startsAt)) return "시작 일시를 확인해 주세요.";
  if (body.expiresAt && Number.isNaN(expiresAt)) return "종료 일시를 확인해 주세요.";
  if (startsAt != null && expiresAt != null && expiresAt <= startsAt) return "종료 일시는 시작 일시보다 이후여야 합니다.";
  return null;
}
