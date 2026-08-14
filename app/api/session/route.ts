import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/authCookie";
import { createClient } from "@/lib/supabase/server";

const signedOut = { user: null, isAdmin: false };

export async function GET() {
  // 이 라우트는 전 페이지 공통 헤더가 마운트마다 부른다. 방문자 대부분은 비로그인인데도
  // getUser() 왕복과 profiles·admin_profiles 조회를 똑같이 치르고 있었다. 세션 쿠키가 아예
  // 없으면 결과가 정해져 있으므로 그 자리에서 끝낸다.
  if (!hasSupabaseAuthCookie((await cookies()).getAll())) return NextResponse.json(signedOut);

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return NextResponse.json(signedOut);

  const [profileResult, adminResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("admin_profiles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
  ]);

  if (profileResult.error) console.error("Header profile lookup failed", profileResult.error);
  if (adminResult.error) console.error("Header admin lookup failed", adminResult.error);

  return NextResponse.json({
    user: {
      email: user.email ?? null,
      displayName: profileResult.data?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    },
    isAdmin: !adminResult.error && Boolean(adminResult.data),
  });
}
