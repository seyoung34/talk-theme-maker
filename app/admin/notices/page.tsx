import AdminNoticesClient from "@/components/admin/AdminNoticesClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  await requireAdmin("/admin/notices");
  return <AdminNoticesClient />;
}
