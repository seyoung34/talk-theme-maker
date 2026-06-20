"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/account";
  const reason = searchParams.get("reason");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasonText = useMemo(() => {
    if (reason === "export") return "테마를 내보내려면 로그인과 1크레딧이 필요합니다.";
    return mode === "signin" ? "크레딧과 내보내기 이력을 관리하려면 로그인하세요." : "계정을 만들고 크레딧을 충전해 테마를 내보낼 수 있습니다.";
  }, [mode, reason]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
            });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setNotice("가입 확인 메일을 보냈습니다. 이메일을 확인해 주세요.");
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "인증에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithKakao = async () => {
    setNotice(null);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
        },
      });
      if (error) throw error;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "카카오 로그인에 실패했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/login" />
      <div className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-md place-items-center px-5 py-8">
        <section className="grid w-full gap-4 rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">계정</p>
            <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">{mode === "signin" ? "로그인" : "회원가입"}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{reasonText}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f8fafc] p-1">
            <button type="button" className={`rounded-xl px-3 py-2 text-sm font-black ${mode === "signin" ? "bg-white text-[#0f172a] shadow" : "text-[#64748b]"}`} onClick={() => setMode("signin")}>
              로그인
            </button>
            <button type="button" className={`rounded-xl px-3 py-2 text-sm font-black ${mode === "signup" ? "bg-white text-[#0f172a] shadow" : "text-[#64748b]"}`} onClick={() => setMode("signup")}>
              회원가입
            </button>
          </div>

          <form className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--color-on-surface)]">이메일</span>
              <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required autoComplete="email" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--color-on-surface)]">비밀번호</span>
              <input className="h-11 rounded-xl border border-[var(--color-outline-variant)] px-3 text-sm font-semibold outline-none" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </label>
            {notice ? <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{notice}</p> : null}
            <button className="rounded-full bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-black text-[var(--color-inverse-on-surface)] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "처리 중..." : mode === "signin" ? "로그인" : "회원가입"}
            </button>
          </form>

          <button type="button" className="rounded-full border border-[#facc15] bg-[#fee500] px-5 py-3 text-sm font-black text-[#111827] transition hover:bg-[#fde047]" onClick={() => void signInWithKakao()} disabled={isSubmitting}>
            카카오로 계속하기
          </button>
        </section>
      </div>
    </main>
  );
}
