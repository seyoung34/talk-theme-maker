import { NextResponse } from "next/server";
import { recordEmailSignupConsentForUser, signupConsentExpectedUserHeader } from "@/lib/policies/signupConsentServer";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // 쿠키 세션으로 쓰는 변경 API다. 교차 출처 요청은 거절하고, 커스텀 헤더 필수로 단순 폼 전송도 막는다.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다.", reason: "forbidden_origin" }, { status: 403 });
  }
  const expectedUserId = request.headers.get(signupConsentExpectedUserHeader);
  if (!expectedUserId || !uuidPattern.test(expectedUserId)) {
    return NextResponse.json({ error: "요청이 올바르지 않습니다.", reason: "invalid_expected_user" }, { status: 400 });
  }

  try {
    const result = await recordEmailSignupConsentForUser(await createClient(), expectedUserId);
    if (result.status === "unauthenticated") return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
    if (result.status === "session_changed") return NextResponse.json({ error: "로그인한 계정이 바뀌었습니다.", reason: "session_changed" }, { status: 409 });
    return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "정책 동의 내용을 저장하지 못했습니다.", reason: "consent_record_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
