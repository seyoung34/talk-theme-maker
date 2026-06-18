import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserConfig } from "@/lib/supabase/config";

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = requireSupabaseBrowserConfig();
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
