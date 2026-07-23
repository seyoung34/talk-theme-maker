import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/config";

export type AdminRole = "admin";

export async function getCurrentAdmin() {
  if (!hasSupabaseBrowserConfig()) return { user: null, profile: null, configured: false };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { user: null, profile: null, configured: true };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { user: null, profile: null, configured: true };

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("user_id,email,role,created_at")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (profileError) {
    console.error("Admin profile lookup failed.", profileError);
  }

  return { user: userData.user, profile, configured: true };
}

// 로컬 QA 전용 우회. 프로덕션에서는 절대 활성화되지 않도록 NODE_ENV와 명시적 플래그를 이중으로 확인한다.
function isAdminQaBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_QA_BYPASS === "1";
}

export async function requireAdmin(returnTo = "/admin") {
  if (isAdminQaBypassEnabled()) {
    console.warn("[admin] ADMIN_QA_BYPASS가 켜져 있어 관리자 인증을 건너뜁니다. 프로덕션에서는 절대 사용하지 마세요.");
    return { user: null, profile: null, configured: true } as Awaited<ReturnType<typeof getCurrentAdmin>>;
  }
  const admin = await getCurrentAdmin();
  if (!admin.configured) redirect(`/admin-login?returnTo=${encodeURIComponent(returnTo)}&reason=missing-config`);
  if (!admin.user) redirect(`/admin-login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!admin.profile) redirect(`/admin-login?returnTo=${encodeURIComponent(returnTo)}&reason=forbidden`);
  return admin;
}

export async function isAdminUser(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("admin_profiles").select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}
