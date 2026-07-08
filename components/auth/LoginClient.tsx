"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";
type Message = { tone: "error" | "success"; text: string } | null;

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (message.includes("email not confirmed")) return "이메일 인증을 완료한 뒤 로그인해 주세요.";
  if (message.includes("user already registered") || message.includes("already been registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (message.includes("password") && message.includes("characters")) return "비밀번호는 8자 이상 입력해 주세요.";
  if (message.includes("rate limit") || message.includes("too many")) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (message.includes("network") || message.includes("fetch")) return "네트워크 연결을 확인하고 다시 시도해 주세요.";
  return "인증을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"));
  const reason = searchParams.get("reason");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const context = useMemo(() => {
    if (reason === "export") {
      return {
        title: "내보내기를 계속하려면 로그인해 주세요",
        description: "로그인 후 편집 화면으로 돌아가 현재 작업을 이어갈 수 있습니다. 테마 내보내기에는 1크레딧이 사용됩니다.",
        destination: "인증을 마치면 편집 화면으로 돌아갑니다.",
      };
    }
    return {
      title: mode === "signin" ? "계정에 로그인" : "새 계정 만들기",
      description: mode === "signin" ? "크레딧과 내보내기 이력을 안전하게 관리하세요." : "계정을 만들고 테마 저장, 크레딧 충전과 내보내기를 시작하세요.",
      destination: returnTo === "/account" ? "인증을 마치면 내 계정으로 이동합니다." : "인증을 마치면 이전 화면으로 돌아갑니다.",
    };
  }, [mode, reason, returnTo]);

  const changeMode = (nextMode: AuthMode) => {
    if (isSubmitting) return;
    setMode(nextMode);
    setMessage(null);
    setPassword("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage({ tone: "error", text: "사용할 이메일 주소를 정확히 입력해 주세요." });
      return;
    }
    if (password.length < 8) {
      setMessage({ tone: "error", text: "비밀번호는 8자 이상 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
        });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage({ tone: "success", text: `${normalizedEmail}로 인증 메일을 보냈습니다. 메일의 인증 링크를 누르면 가입이 완료됩니다.` });
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithKakao = async () => {
    if (isSubmitting) return;
    setMessage(null);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
      });
      if (error) throw error;
    } catch (error) {
      setMessage({ tone: "error", text: getAuthErrorMessage(error) });
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/login" />
      <div className="mx-auto grid min-h-[calc(100dvh-65px)] w-full max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(400px,0.72fr)] md:px-8 md:py-14">
        <section className="hidden max-w-xl md:block" aria-label="서비스 안내">
          <div className="mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
            <LockKeyhole aria-hidden="true" size={23} strokeWidth={2.2} />
          </div>
          <p className="text-sm font-extrabold tracking-[0.12em] text-[var(--color-secondary)]">TALK THEME MAKER</p>
          <h2 className="mt-3 font-[var(--font-display)] text-4xl font-semibold leading-tight tracking-[-0.04em] text-[var(--color-on-surface)]">만든 테마와 크레딧을<br />한 계정에서 관리하세요.</h2>
          <ul className="mt-8 grid gap-4 text-sm font-semibold text-[var(--color-on-surface-variant)]">
            {["카카오 계정으로 빠르게 시작", "결제한 크레딧과 사용 내역 확인", "내보내기 기록을 기기와 상관없이 관리"].map((item) => (
              <li key={item} className="flex items-center gap-3"><CheckCircle2 className="shrink-0 text-[var(--color-secondary)]" size={19} aria-hidden="true" />{item}</li>
            ))}
          </ul>
        </section>

        <section className="w-full rounded-[24px] border border-[var(--color-outline-variant)] bg-[var(--color-surface-lowest)] p-5 shadow-[0_20px_55px_rgba(48,49,46,0.08)] sm:p-7" aria-labelledby="auth-title">
          <div className="mb-6">
            <p className="text-xs font-extrabold tracking-[0.14em] text-[var(--color-secondary)]">계정</p>
            <h1 id="auth-title" className="mt-2 font-[var(--font-display)] text-[28px] font-semibold tracking-[-0.035em] text-[var(--color-on-surface)]">{context.title}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--color-on-surface-variant)]">{context.description}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-[var(--color-surface-low)] p-1" role="tablist" aria-label="인증 방식">
            {(["signin", "signup"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item} className={`rounded-[9px] px-3 py-2.5 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] ${mode === item ? "bg-white text-[var(--color-on-surface)] shadow-sm" : "text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"}`} onClick={() => changeMode(item)} disabled={isSubmitting}>
                {item === "signin" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-extrabold text-[#191919] transition hover:bg-[#f5dc00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#191919] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => void signInWithKakao()} disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <span className="text-base" aria-hidden="true">●</span>}
            카카오로 {mode === "signin" ? "로그인" : "시작하기"}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold text-[var(--color-outline)]" aria-hidden="true"><span className="h-px flex-1 bg-[var(--color-outline-variant)]" />또는 이메일로 계속<span className="h-px flex-1 bg-[var(--color-outline-variant)]" /></div>

          <form className="grid gap-4" onSubmit={submit} noValidate>
            <label className="grid gap-2 text-sm font-extrabold text-[var(--color-on-surface)]">
              이메일
              <input className="h-12 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="name@example.com" required autoComplete="email" disabled={isSubmitting} aria-invalid={message?.tone === "error"} />
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-[var(--color-on-surface)]">
              비밀번호
              <span className="relative">
                <input className="h-12 w-full rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 pr-12 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.currentTarget.value)} placeholder="8자 이상" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} disabled={isSubmitting} aria-invalid={message?.tone === "error"} />
                <button type="button" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)]" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} disabled={isSubmitting}>
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </span>
            </label>

            {message ? (
              <div className={`flex gap-2 rounded-xl border px-3.5 py-3 text-sm font-semibold leading-5 ${message.tone === "error" ? "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]"}`} role={message.tone === "error" ? "alert" : "status"}>
                {message.tone === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />}{message.text}
              </div>
            ) : null}

            <button className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--color-inverse-surface)] px-5 py-3 text-sm font-extrabold text-[var(--color-inverse-on-surface)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />처리 중</> : <>{mode === "signin" ? "이메일로 로그인" : "이메일로 가입"}<ArrowRight size={17} aria-hidden="true" /></>}
            </button>
          </form>

          <p className="mt-5 border-t border-[var(--color-outline-variant)] pt-4 text-center text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{context.destination}</p>
        </section>
      </div>
    </main>
  );
}
