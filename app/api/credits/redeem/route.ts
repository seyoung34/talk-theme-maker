import { NextResponse } from "next/server";
import { normalizeCreditCode, isValidCreditCode } from "@/lib/billing/creditCodes.server";
import { createClient } from "@/lib/supabase/server";

type RedeemBody = { code?: string };
type RedeemResult = { credits_granted: number; balance: number };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RedeemBody;
  const code = normalizeCreditCode(body.code ?? "");
  if (!isValidCreditCode(code)) return NextResponse.json({ error: "코드 형식을 확인해 주세요.", reason: "invalid_code" }, { status: 400 });

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  const { data, error } = await supabase.rpc("redeem_credit_code", { p_code: code });
  if (error) {
    const reason = getRedeemReason(error.message);
    return NextResponse.json({ error: getRedeemMessage(reason), reason }, { status: reason === "unknown" ? 500 : 400 });
  }

  const result = (data as RedeemResult[] | null)?.[0];
  if (!result) return NextResponse.json({ error: "크레딧 지급 결과를 확인하지 못했습니다.", reason: "unknown" }, { status: 500 });
  return NextResponse.json({ creditsGranted: result.credits_granted, balance: result.balance });
}

function getRedeemReason(message: string) {
  const reasons = ["code_already_redeemed", "code_limit_reached", "code_not_started", "code_expired", "code_inactive", "code_not_found", "invalid_code", "unauthenticated"] as const;
  return reasons.find((reason) => message.includes(reason)) ?? "unknown";
}

function getRedeemMessage(reason: ReturnType<typeof getRedeemReason>) {
  const messages: Record<ReturnType<typeof getRedeemReason>, string> = {
    code_already_redeemed: "이미 사용한 코드입니다.",
    code_limit_reached: "코드의 전체 사용 한도가 소진되었습니다.",
    code_not_started: "아직 사용할 수 없는 코드입니다.",
    code_expired: "사용 기간이 종료된 코드입니다.",
    code_inactive: "현재 중지된 코드입니다.",
    code_not_found: "유효하지 않은 코드입니다.",
    invalid_code: "코드 형식을 확인해 주세요.",
    unauthenticated: "로그인이 필요합니다.",
    unknown: "코드를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[reason];
}
