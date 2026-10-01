import AdminPromotionsClient from "@/components/admin/AdminPromotionsClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  await requireAdmin("/admin/promotions");
  return <AdminPromotionsClient />;
}
