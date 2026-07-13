"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/client";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PasswordResetRequestClient() {
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setError("이메일 주소를 정확히 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const updateTarget = `/update-password?returnTo=${encodeURIComponent(returnTo)}`;
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(updateTarget)}`;
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) throw resetError;
      setIsSent(true);
    } catch {
      setError("재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f9ff] px-5 py-10 text-[var(--color-on-background)]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dbe8fb] bg-white p-6 shadow-[0_24px_70px_rgba(47,107,191,0.12)] sm:p-8" aria-labelledby="reset-title">
        {isSent ? (
          <div className="grid gap-5 text-center">
            <CheckCircle2 className="mx-auto text-[#2f6bbf]" size={38} aria-hidden="true" />
            <div>
              <h1 id="reset-title" className="text-2xl font-black">재설정 메일을 확인해 주세요</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{email.trim().toLowerCase()}로 비밀번호 변경 링크를 보냈습니다.</p>
            </div>
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-sm font-bold text-[#2f6bbf] underline underline-offset-4">로그인으로 돌아가기</Link>
          </div>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3d7bd6]">Password reset</p>
            <h1 id="reset-title" className="mt-2 text-3xl font-black">비밀번호 찾기</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">가입한 이메일로 비밀번호 변경 링크를 보내드립니다.</p>
            <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
              <label className="grid gap-2 text-sm font-extrabold">이메일<input className="h-12 rounded-xl border border-[var(--color-outline-variant)] px-3.5 outline-none focus:border-[var(--color-secondary)]" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} autoComplete="email" placeholder="name@example.com" disabled={isSubmitting} /></label>
              {error ? <p className="rounded-xl bg-[var(--color-error-container)] px-3.5 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">{error}</p> : null}
              <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 font-extrabold text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" size={18} />전송 중</> : "재설정 메일 보내기"}</button>
            </form>
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-5 block text-center text-sm font-bold text-[#2f6bbf] underline-offset-4 hover:underline">로그인으로 돌아가기</Link>
          </>
        )}
      </section>
    </main>
  );
}
