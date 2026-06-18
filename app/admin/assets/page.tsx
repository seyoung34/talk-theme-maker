import AdminAssetsClient from "@/components/admin/AdminAssetsClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  await requireAdmin("/admin/assets");

  return <AdminAssetsClient />;
}
