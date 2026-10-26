import { workerRequestEnvironment } from "@/lib/cloudflare/workerRequestEnvironment";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseBrowserConfig, requireSupabaseServerConfig } from "@/lib/supabase/config";

export async function createClient() {
  // Maintenance uses only createAdminClient; don't initialize Next's request
  // runtime when a Worker fast path imports the shared database helpers.
  const { cookies } = await import("next/headers");
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
  const env = workerRequestEnvironment();
  const { supabaseUrl, supabaseSecretKey } = env ? workerAdminConfig(env) : requireSupabaseServerConfig();
  return createSupabaseClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function workerAdminConfig(env: Record<string, string | undefined>) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase browser configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase server configuration is missing. Set SUPABASE_SECRET_KEY.");
  }
  return { supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey: env.SUPABASE_SECRET_KEY };
}
