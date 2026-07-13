import { Suspense } from "react";
import UpdatePasswordClient from "@/components/auth/UpdatePasswordClient";

export default function UpdatePasswordPage() {
  return <Suspense fallback={null}><UpdatePasswordClient /></Suspense>;
}
