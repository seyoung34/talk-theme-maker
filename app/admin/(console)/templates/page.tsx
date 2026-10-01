import AdminSystemTemplateList from "@/components/admin/AdminSystemTemplateList";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  await requireAdmin("/admin/templates");

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 md:px-8">
      <AdminSystemTemplateList />
    </main>
  );
}
