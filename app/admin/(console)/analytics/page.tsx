import AdminMarketingClient from "@/components/admin/AdminMarketingClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdmin("/admin/analytics");
  return <AdminMarketingClient />;
}
