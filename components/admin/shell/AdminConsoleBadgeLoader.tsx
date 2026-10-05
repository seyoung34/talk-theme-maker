import { getAdminConsoleBadges } from "@/lib/admin/consoleBadges";
import { AdminConsoleBadgeSync } from "./AdminConsoleShell";

/** Only rendered by the layout after an administrator has been verified. */
export default async function AdminConsoleBadgeLoader() {
  return <AdminConsoleBadgeSync badges={await getAdminConsoleBadges()} />;
}
