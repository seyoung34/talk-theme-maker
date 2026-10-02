import AdminSystemTemplateList from "@/components/admin/AdminSystemTemplateList";
import { adminPageClassName } from "@/components/admin/shell/AdminPageHeader";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  await requireAdmin("/admin/templates");

  return (
    <main className={adminPageClassName}>
      <AdminSystemTemplateList />
    </main>
  );
}
