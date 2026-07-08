"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"), "/admin");
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasonText = useMemo(() => {
    if (reason === "missing-config") return "Supabase 환경변수가 설정되지 않았습니다.";
    if (reason === "forbidden") return "관리자 권한이 없는 계정입니다.";
    return "관리자 계정으로 로그인해 주세요.";
  }, [reason]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/admin" />
      <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-md place-items-center px-5 py-8">
        <form className="grid w-full gap-4 rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)]" onSubmit={submit}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Admin</p>
            <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">관리자 로그인</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{reasonText}</p>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-black text-[var(--color-on-surface)]">이메일</span>
            <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-[var(--color-on-surface)]">비밀번호</span>
            <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} required />
          </label>
          {notice ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{notice}</p> : null}
          <button className="rounded-full bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중" : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}
