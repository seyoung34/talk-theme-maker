import { Suspense } from "react";
import AdminLoginClient from "@/components/admin/AdminLoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginClient />
    </Suspense>
  );
}
