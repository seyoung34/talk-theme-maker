import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return NextResponse.json({ user: null, isAdmin: false });

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
