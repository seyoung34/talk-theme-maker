export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
export const payappUserId = process.env.PAYAPP_USER_ID;
export const payappLinkKey = process.env.PAYAPP_LINK_KEY;
export const payappLinkValue = process.env.PAYAPP_LINK_VALUE;
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

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

export function requirePayappServerConfig() {
  if (!payappUserId || !payappLinkKey || !payappLinkValue) {
    throw new Error("PayApp server configuration is missing. Set PAYAPP_USER_ID, PAYAPP_LINK_KEY, and PAYAPP_LINK_VALUE.");
  }
  return { payappUserId, payappLinkKey, payappLinkValue };
}

export function getSiteUrl() {
  return siteUrl ?? "http://localhost:3000";
}
