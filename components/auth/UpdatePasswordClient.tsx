"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError("비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해 주세요.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f9ff] px-5 py-10 text-[var(--color-on-background)]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dbe8fb] bg-white p-6 shadow-[0_24px_70px_rgba(47,107,191,0.12)] sm:p-8" aria-labelledby="update-password-title">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3d7bd6]">New password</p>
        <h1 id="update-password-title" className="mt-2 text-3xl font-black">새 비밀번호 설정</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">새로 사용할 비밀번호를 두 번 입력해 주세요.</p>
        <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
          <label className="grid gap-2 text-sm font-extrabold">새 비밀번호<input className="h-12 rounded-xl border border-[var(--color-outline-variant)] px-3.5 outline-none focus:border-[var(--color-secondary)]" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={8} autoComplete="new-password" placeholder="8자 이상" disabled={isSubmitting} /></label>
          <label className="grid gap-2 text-sm font-extrabold">새 비밀번호 확인<input className="h-12 rounded-xl border border-[var(--color-outline-variant)] px-3.5 outline-none focus:border-[var(--color-secondary)]" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} minLength={8} autoComplete="new-password" placeholder="비밀번호 다시 입력" disabled={isSubmitting} /></label>
          {error ? <p className="rounded-xl bg-[var(--color-error-container)] px-3.5 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">{error}</p> : null}
          <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 font-extrabold text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" size={18} />변경 중</> : "비밀번호 변경"}</button>
        </form>
      </section>
    </main>
  );
}
