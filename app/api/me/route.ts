import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUserOrNull } from "@/lib/billing/credits";

export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ user: null, profile: null, credits: 0, exports: [] });

  const admin = createAdminClient();
  await Promise.all([
    admin.from("profiles").upsert({
      user_id: user.id,
      email: user.email ?? "",
      display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      provider: user.app_metadata?.provider ?? "email",
    }),
    admin.from("credit_balances").upsert({ user_id: user.id, balance: 0 }, { ignoreDuplicates: true }),
  ]);
  const [{ data: profile }, { data: balance }, { data: exports }] = await Promise.all([
    admin.from("profiles").select("user_id,email,display_name,avatar_url,provider").eq("user_id", user.id).maybeSingle(),
    admin.from("credit_balances").select("balance").eq("user_id", user.id).maybeSingle(),
    admin.from("export_jobs").select("id,platform,export_mode,status,credit_cost,file_name,error,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    credits: balance?.balance ?? 0,
    exports: exports ?? [],
  });
}
