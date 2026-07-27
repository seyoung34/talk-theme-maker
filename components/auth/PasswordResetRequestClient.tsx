"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type ResetStage = "form" | "check-email";

export default function PasswordResetRequestClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<ResetStage>("form");
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const sendResetCode = async (normalizedEmail: string) => {
    setIsSubmitting(true);
    setError("");
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(normalizedEmail);
      if (resetError) throw resetError;
      setStage("check-email");
      setResendCooldown(60);
    } catch {
      setError("재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setError("이메일 주소를 정확히 입력해 주세요.");
      return;
    }
    await sendResetCode(normalizedEmail);
  };

  const resendCode = async () => {
    if (isSubmitting || resendCooldown > 0) return;
    await sendResetCode(email.trim().toLowerCase());
  };

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const token = verificationCode.trim();
    if (!/^\d{8}$/.test(token)) {
      setError("메일로 받은 8자리 인증번호를 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const { error: verifyError } = await createClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "recovery",
      });
      if (verifyError) throw verifyError;
      router.replace(`/update-password?returnTo=${encodeURIComponent(returnTo)}`);
      router.refresh();
    } catch {
      setError("인증번호가 만료됐거나 올바르지 않습니다. 새 인증번호를 요청해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f9ff] px-5 py-10 text-[var(--color-on-background)]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dbe8fb] bg-white p-6 shadow-[0_24px_70px_rgba(47,107,191,0.12)] sm:p-8" aria-labelledby="reset-title">
        {stage === "check-email" ? (
          <div className="grid gap-5 text-center">
            <CheckCircle2 className="mx-auto text-[#2f6bbf]" size={38} aria-hidden="true" />
            <div>
              <h1 id="reset-title" className="text-2xl font-black">인증번호를 입력해 주세요</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{email.trim().toLowerCase()}로 보낸 8자리 인증번호를 입력하면 새 비밀번호를 설정할 수 있습니다.</p>
            </div>
            <form className="grid gap-3 text-left" onSubmit={verifyCode} noValidate>
              <label className="grid gap-2 text-sm font-extrabold">인증번호<input className="h-12 rounded-xl border border-[var(--color-outline-variant)] px-3.5 text-center text-lg font-black tracking-[0.25em] outline-none focus:border-[var(--color-secondary)]" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={verificationCode} onChange={(event) => setVerificationCode(event.currentTarget.value.replace(/\D/g, ""))} placeholder="12345678" disabled={isSubmitting} /></label>
              {error ? <p className="rounded-xl bg-[var(--color-error-container)] px-3.5 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">{error}</p> : null}
              <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 font-extrabold text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" size={18} />확인 중</> : "인증번호 확인"}</button>
            </form>
            <button type="button" className="text-sm font-bold text-[#2f6bbf] underline underline-offset-4 disabled:opacity-50" onClick={() => void resendCode()} disabled={isSubmitting || resendCooldown > 0}>{resendCooldown > 0 ? `${resendCooldown}초 후 다시 보내기` : "인증번호 다시 보내기"}</button>
            <button type="button" className="text-sm font-bold text-[var(--color-on-surface-variant)] underline underline-offset-4" onClick={() => { setStage("form"); setVerificationCode(""); setError(""); }} disabled={isSubmitting}>이메일 주소 수정</button>
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-sm font-bold text-[#2f6bbf] underline underline-offset-4">로그인으로 돌아가기</Link>
          </div>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3d7bd6]">Password reset</p>
            <h1 id="reset-title" className="mt-2 text-3xl font-black">비밀번호 찾기</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">가입한 이메일로 8자리 인증번호를 보내드립니다.</p>
            <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
              <label className="grid gap-2 text-sm font-extrabold">이메일<input className="h-12 rounded-xl border border-[var(--color-outline-variant)] px-3.5 outline-none focus:border-[var(--color-secondary)]" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} autoComplete="email" placeholder="name@example.com" disabled={isSubmitting} /></label>
              {error ? <p className="rounded-xl bg-[var(--color-error-container)] px-3.5 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">{error}</p> : null}
              <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 font-extrabold text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" size={18} />전송 중</> : "인증번호 보내기"}</button>
            </form>
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-5 block text-center text-sm font-bold text-[#2f6bbf] underline-offset-4 hover:underline">로그인으로 돌아가기</Link>
          </>
        )}
      </section>
    </main>
  );
}
