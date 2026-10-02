import AdminInquiriesClient from "@/components/admin/AdminInquiriesClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage() {
  await requireAdmin("/admin/inquiries");
  return <AdminInquiriesClient />;
}
