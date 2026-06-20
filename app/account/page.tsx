import { Suspense } from "react";
import AccountClient from "@/components/account/AccountClient";

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountClient />
    </Suspense>
  );
}
