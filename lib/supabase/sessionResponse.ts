import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseAuthCookie } from "./authCookie";

const signedOut = { user: null, isAdmin: false };

// Cookie presence only skips work for anonymous requests; getUser verifies auth.
export async function sessionResponse(cookieList: { name: string }[], createClient: () => Promise<SupabaseClient> | SupabaseClient) {
  if (!hasSupabaseAuthCookie(cookieList)) return Response.json(signedOut);
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return Response.json(signedOut);
  const [profileResult, adminResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("admin_profiles").select("user_id").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
  ]);
  if (profileResult.error) console.error("Header profile lookup failed", profileResult.error);
  if (adminResult.error) console.error("Header admin lookup failed", adminResult.error);
  return Response.json({
    user: {
      email: user.email ?? null,
      displayName: profileResult.data?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    },
    isAdmin: !adminResult.error && Boolean(adminResult.data),
  });
}
