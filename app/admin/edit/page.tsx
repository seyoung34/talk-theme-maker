import ProjectImporterClient from "@/components/project/ProjectImporterClient";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminEditPage() {
  await requireAdmin("/admin/edit");

  return <ProjectImporterClient mode="admin" />;
}
