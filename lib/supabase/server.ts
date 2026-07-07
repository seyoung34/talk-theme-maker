import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseBrowserConfig, requireSupabaseServerConfig } from "@/lib/supabase/config";

export async function createClient() {
  const { supabaseUrl, supabasePublishableKey } = requireSupabaseBrowserConfig();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; middleware.ts refreshes sessions.
        }
      },
    },
  });
}

export function createAdminClient() {
  const { supabaseUrl, supabaseSecretKey } = requireSupabaseServerConfig();
  return createSupabaseClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
