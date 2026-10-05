import AdminLoadingState from "@/components/admin/shell/AdminLoadingState";
import { adminPageClassName } from "@/components/admin/shell/AdminPageHeader";

export default function AdminConsoleLoading() {
  return <main className={adminPageClassName} aria-busy="true"><AdminLoadingState /></main>;
}
