import { Suspense } from "react";
import PasswordResetRequestClient from "@/components/auth/PasswordResetRequestClient";

export default function ForgotPasswordPage() {
  return <Suspense fallback={null}><PasswordResetRequestClient /></Suspense>;
}
