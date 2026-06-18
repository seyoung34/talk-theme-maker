export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export function hasSupabaseBrowserConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function requireSupabaseBrowserConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase browser configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { supabaseUrl, supabasePublishableKey };
}

export function requireSupabaseServerConfig() {
  const browserConfig = requireSupabaseBrowserConfig();
  if (!supabaseSecretKey) {
    throw new Error("Supabase server configuration is missing. Set SUPABASE_SECRET_KEY.");
  }
  return { ...browserConfig, supabaseSecretKey };
}
