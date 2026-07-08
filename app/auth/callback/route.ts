import { NextResponse, type NextRequest } from "next/server";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeReturnTarget(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, getSiteUrl()));
}
