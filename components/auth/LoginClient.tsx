"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, MessageCircle, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import { getSafeReturnTarget } from "@/lib/auth/redirectTarget";
import { addPolicyConsentToCallbackUrl, recordCurrentPolicyConsents } from "@/lib/policies/consent";
import { claimSignupBonusFromClient } from "@/lib/billing/signupBonusClient";
import { createClient } from "@/lib/supabase/client";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";
import { trackAnalyticsEvent } from "@/lib/analytics/ga4";

type AuthMode = "signin" | "signup";
type Message = { tone: "error" | "success"; text: string } | null;
type AuthStage = "form" | "check-email";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (message.includes("email not confirmed")) return "이메일 인증을 완료한 뒤 로그인해 주세요.";
  if (message.includes("user already registered") || message.includes("already been registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (message.includes("password") && message.includes("characters")) return "비밀번호는 8자 이상 입력해 주세요.";
  if (message.includes("otp") || message.includes("token") || message.includes("expired")) return "인증번호가 만료됐거나 올바르지 않습니다. 새 인증번호를 요청해 주세요.";
  if (message.includes("rate limit") || message.includes("too many")) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (message.includes("network") || message.includes("fetch")) return "네트워크 연결을 확인하고 다시 시도해 주세요.";
  return "인증을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
}

async function claimSignupBonusAfterSignup() {
  const claim = await claimSignupBonusFromClient().catch(() => null);
  if (claim?.granted) {
    trackAnalyticsEvent("signup_bonus_granted", {
      campaign_key: claim.campaignKey ?? "signup_bonus_v1",
      credits_granted: claim.creditsGranted ?? 0,
    });
  }
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTarget(searchParams.get("returnTo"));
  const reason = searchParams.get("reason");
  const authError = searchParams.get("authError");
  const accountDeleted = searchParams.get("accountDeleted") === "1";
  const passwordUpdated = searchParams.get("passwordUpdated") === "1";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [stage, setStage] = useState<AuthStage>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(false);
  const [hasConfirmedMinimumAge, setHasConfirmedMinimumAge] = useState(false);
  const [emailSignupOpen, setEmailSignupOpen] = useState(false);
  const [message, setMessage] = useState<Message>(() => authError ? { tone: "error", text: authError } : accountDeleted ? { tone: "success", text: "회원탈퇴가 완료되었습니다." } : passwordUpdated ? { tone: "success", text: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요." } : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationCode, setVerificationCode] = useState("");
  const hasAcceptedRequiredPolicies = hasAcceptedTerms && hasAcceptedPrivacy;
  const hasAcceptedSignupRequirements = hasAcceptedRequiredPolicies && hasConfirmedMinimumAge;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    trackAnalyticsEvent("auth_prompt_viewed", { reason: reason === "export" ? "export" : "general", mode });
  }, [mode, reason]);

  const context = useMemo(() => {
    if (reason === "export") {
      return {
        title: mode === "signup" ? "첫 테마 파일을 무료로 받아보세요" : "테마 파일을 받으려면 로그인해 주세요",
        description: mode === "signup"
          ? "카카오 또는 이메일로 가입하면 첫 테마 파일을 만들 때 사용할 가입 혜택 1크레딧을 드립니다."
          : "로그인 후 편집 화면으로 돌아가 현재 작업을 이어갈 수 있습니다. 신규 가입자는 첫 테마 파일을 무료로 받을 수 있습니다.",
        destination: "인증을 마치면 편집 화면으로 돌아갑니다.",
      };
    }
    return {
      title: mode === "signin" ? "계정에 로그인" : "새 계정 만들기",
      description: mode === "signin" ? `${persistenceNotice.accountDetailed} 편집 프로젝트는 ${persistenceNotice.browserShort}됩니다.` : `${persistenceNotice.accountDetailed} 편집 프로젝트는 ${persistenceNotice.browserShort}되며 다른 기기로 자동 동기화되지 않습니다.`,
      destination: returnTo === "/account" ? "인증을 마치면 내 계정으로 이동합니다." : "인증을 마치면 이전 화면으로 돌아갑니다.",
    };
  }, [mode, reason, returnTo]);

  const changeMode = (nextMode: AuthMode) => {
    if (isSubmitting) return;
    setMode(nextMode);
    setMessage(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setEmailSignupOpen(false);
    setStage("form");
    setVerificationCode("");
    setResendCooldown(0);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setMessage({ tone: "error", text: "사용할 이메일 주소를 정확히 입력해 주세요." });
      return;
    }
    if (password.length < 8) {
      setMessage({ tone: "error", text: "비밀번호는 8자 이상 입력해 주세요." });
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setMessage({ tone: "error", text: "비밀번호와 비밀번호 확인이 일치하지 않습니다." });
      return;
    }
    if (mode === "signup" && !hasAcceptedSignupRequirements) {
      setMessage({ tone: "error", text: "만 14세 이상임을 확인하고 필수 정책에 동의해 주세요." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    trackAnalyticsEvent(mode === "signup" ? "signup_started" : "login_started", { provider: "email" });
    try {
      const supabase = createClient();
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({ email: normalizedEmail, password });
      if (result.error) throw result.error;
      if (mode === "signup" && result.data.session) {
        await recordCurrentPolicyConsents(supabase, "email_signup");
        await claimSignupBonusAfterSignup();
      }
      if (mode === "signup" && !result.data.session) {
        setStage("check-email");
        setResendCooldown(60);
        setMessage(null);
        return;
      }
      trackAnalyticsEvent(mode === "signup" ? "signup_completed" : "login_completed", { provider: "email" });
      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      trackAnalyticsEvent(mode === "signup" ? "signup_failed" : "login_failed", { provider: "email", reason: "auth_error" });
      setMessage({ tone: "error", text: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendSignupEmail = async () => {
    if (isSubmitting || resendCooldown > 0) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });
      if (error) throw error;
      setResendCooldown(60);
      setMessage({ tone: "success", text: "인증 메일을 다시 보냈습니다." });
    } catch (error) {
      setMessage({ tone: "error", text: getAuthErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifySignupEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const token = verificationCode.trim();
    if (!/^\d{8}$/.test(token)) {
      setMessage({ tone: "error", text: "메일로 받은 8자리 인증번호를 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (error) throw error;
      await recordCurrentPolicyConsents(supabase, "email_signup").catch(() => undefined);
      await claimSignupBonusAfterSignup();
      trackAnalyticsEvent("signup_completed", { provider: "email" });
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
    // 로그인은 연령 확인 없이 진행한다. 연령 확인과 정책 동의는 회원가입에서만 받는다.
    if (mode === "signup" && !hasConfirmedMinimumAge) {
      setMessage({ tone: "error", text: "카카오 계정으로 계속하려면 만 14세 이상임을 확인해 주세요." });
      return;
    }
    if (mode === "signup" && !hasAcceptedRequiredPolicies) {
      setMessage({ tone: "error", text: "이용약관과 개인정보 처리방침에 동의해 주세요." });
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    trackAnalyticsEvent(mode === "signup" ? "signup_started" : "login_started", { provider: "kakao" });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: mode === "signup" ? getAuthCallbackUrl("kakao_signup") : getAuthCallbackUrl() },
      });
      if (error) throw error;
    } catch (error) {
      trackAnalyticsEvent(mode === "signup" ? "signup_failed" : "login_failed", { provider: "kakao", reason: "auth_error" });
      setMessage({ tone: "error", text: getAuthErrorMessage(error) });
      setIsSubmitting(false);
    }
  };

  const getAuthCallbackUrl = (consentSource?: "email_signup" | "kakao_signup") => {
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`;
    return consentSource ? addPolicyConsentToCallbackUrl(callbackUrl, consentSource) : callbackUrl;
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_18%,#ffffff_42%,#f7fbff_70%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      <div>
        <SiteHeader currentPath="/login" />
      </div>
      <div className="relative mx-auto grid min-h-dvh w-full max-w-7xl items-center gap-10 px-0 py-0 sm:px-6 sm:py-8 lg:min-h-[calc(100dvh-73px)] lg:grid-cols-[minmax(0,0.98fr)_minmax(390px,0.72fr)] lg:px-8 lg:py-14">
        <Star className="pointer-events-none absolute left-[4%] top-[10%] hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <MessageCircle className="pointer-events-none absolute left-[1%] top-[44%] hidden h-10 w-10 -rotate-6 text-[#9bc0f5] lg:block" />
        <Sparkles className="pointer-events-none absolute right-[38%] top-[14%] hidden h-7 w-7 text-[#fbbf24] lg:block" />

        <section className="relative hidden max-w-2xl lg:block" aria-label="서비스 안내">
          <div className="pointer-events-none absolute -left-10 top-8 hidden h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(91,155,255,0.22),transparent_72%)] blur-3xl md:block" />
          <div className="pointer-events-none absolute left-28 top-28 hidden h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(254,229,0,0.2),transparent_72%)] blur-3xl md:block" />

          <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/85 px-3.5 py-1.5 text-[12px] font-black text-[#3d7bd6] shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
            계정으로 테마와 크레딧을 이어서 관리
          </span>

          <div className="mt-6 inline-flex size-14 items-center justify-center rounded-[22px] bg-[#fff2a8] text-[#665300] shadow-[0_18px_40px_rgba(254,229,0,0.28)]">
            <LockKeyhole aria-hidden="true" size={24} strokeWidth={2.2} />
          </div>

          <h2 className="mt-6 text-balance font-[var(--font-display)] text-[40px] font-semibold leading-[1.12] tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[52px] lg:text-[64px]">
            만든 테마와 크레딧을
            <span className="mt-1 block text-[#2f6bbf]">한 계정에서 가볍게</span>
            이어가세요.
          </h2>
          <p className="mt-5 max-w-xl text-[16px] font-semibold leading-8 text-[var(--color-on-surface-variant)] sm:text-[18px]">
            카카오 로그인이나 이메일 계정으로 접속하면 결제한 크레딧과 테마 파일 기록을 한곳에서
            정리할 수 있습니다. 작업을 멈췄다가 다시 돌아와도 흐름이 끊기지 않습니다.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              "카카오 계정으로 빠르게 시작",
              "결제한 크레딧과 사용 내역 확인",
              "테마 파일 기록을 기기와 상관없이 관리",
            ].map((item, index) => (
              <li
                key={item}
                className={`rounded-[26px] border border-[#dbe8fb] bg-white/82 p-4 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)] shadow-[0_18px_42px_rgba(47,107,191,0.08)] backdrop-blur ${index === 1 ? "sm:-translate-y-2" : ""}`}
              >
                <CheckCircle2 className="mb-3 text-[#2f6bbf]" size={20} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-3.5 py-2 text-xs font-bold text-[var(--color-on-surface-variant)] shadow-sm">
            <Star className="h-3.5 w-3.5 fill-[#fee500] text-[#fee500]" />
            {context.destination}
          </p>
        </section>

        <section className="relative grid min-h-dvh w-full content-center overflow-hidden bg-white px-5 py-8 sm:min-h-0 sm:max-w-lg sm:justify-self-center sm:rounded-[30px] sm:border sm:border-[#dbe8fb] sm:bg-[linear-gradient(180deg,rgba(232,241,255,0.72)_0%,rgba(255,255,255,0.96)_24%,rgba(255,255,255,0.96)_100%)] sm:p-7 sm:shadow-[0_28px_80px_rgba(47,107,191,0.14)] lg:max-w-none" aria-labelledby="auth-title">
          <div className="mb-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">Account</p>
            <h1 id="auth-title" className="mt-2 font-[var(--font-display)] text-[30px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)]">{context.title}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">{context.description}</p>
          </div>

          {stage === "check-email" ? (
            <div className="grid gap-5 rounded-[24px] border border-[#cfe0ff] bg-white/80 p-5 text-center">
              <CheckCircle2 className="mx-auto text-[#2f6bbf]" size={36} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-black text-[var(--color-on-surface)]">인증 메일을 확인해 주세요</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
                  <strong className="text-[var(--color-on-surface)]">{email.trim().toLowerCase()}</strong>로 8자리 인증번호를 보냈습니다. 아래에 입력하면 회원가입이 완료됩니다.
                </p>
                <p className="mt-2 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">이미 가입한 이메일이라면 <button type="button" className="font-extrabold text-[#2f6bbf] underline underline-offset-2" onClick={() => changeMode("signin")} disabled={isSubmitting}>로그인</button>하거나 비밀번호를 재설정해 주세요.</p>
              </div>
              <form className="grid gap-3" onSubmit={verifySignupEmail} noValidate>
                <label className="grid gap-2 text-left text-sm font-extrabold text-[var(--color-on-surface)]">
                  인증번호
                  <input className="h-12 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-center text-lg font-black tracking-[0.25em] outline-none transition placeholder:tracking-normal placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={verificationCode} onChange={(event) => setVerificationCode(event.currentTarget.value.replace(/\D/g, ""))} placeholder="12345678" disabled={isSubmitting} aria-invalid={message?.tone === "error"} />
                </label>
                <button type="submit" className="min-h-11 rounded-full bg-[var(--color-secondary)] px-4 text-sm font-extrabold text-white disabled:opacity-50" disabled={isSubmitting}>
                  {isSubmitting ? "확인 중" : "인증번호 확인"}
                </button>
              </form>
              {message ? (
                <div className={`rounded-xl border px-3.5 py-3 text-sm font-semibold ${message.tone === "error" ? "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]"}`} role={message.tone === "error" ? "alert" : "status"}>
                  {message.text}
                </div>
              ) : null}
              <button type="button" className="min-h-11 rounded-full border border-[#cfe0ff] bg-white px-4 text-sm font-extrabold text-[#2f6bbf] disabled:opacity-50" onClick={() => void resendSignupEmail()} disabled={isSubmitting || resendCooldown > 0}>
                {isSubmitting ? "전송 중" : resendCooldown > 0 ? `${resendCooldown}초 후 다시 보내기` : "인증번호 다시 보내기"}
              </button>
              <button type="button" className="text-sm font-bold text-[var(--color-on-surface-variant)] underline underline-offset-4" onClick={() => { setStage("form"); setVerificationCode(""); setMessage(null); }} disabled={isSubmitting}>
                이메일 주소 수정
              </button>
            </div>
          ) : (
            <>
          <div className="mb-5 grid grid-cols-2 rounded-full border border-[#dbe8fb] bg-[#f4f9ff] p-1.5" role="tablist" aria-label="인증 방식">
            {(["signin", "signup"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item} className={`rounded-full px-3 py-2.5 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] ${mode === item ? "bg-white text-[var(--color-on-surface)] shadow-[0_8px_18px_rgba(47,107,191,0.12)]" : "text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"}`} onClick={() => changeMode(item)} disabled={isSubmitting}>
                {item === "signin" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          {mode === "signup" ? (
            <div className="grid gap-4">
              <fieldset className="grid gap-2.5 rounded-[18px] border border-[#dbe8fb] bg-[#f7fbff] p-3.5">
                <legend className="px-1 text-xs font-extrabold text-[var(--color-on-surface)]">필수 정책 동의</legend>
                <MinimumAgeConfirmationCheck checked={hasConfirmedMinimumAge} onChange={setHasConfirmedMinimumAge} disabled={isSubmitting} />
                <PolicyConsentCheck id="accept-terms" checked={hasAcceptedTerms} onChange={setHasAcceptedTerms} label="이용약관에 동의합니다." href="/terms" linkLabel="약관 보기" disabled={isSubmitting} />
                <PolicyConsentCheck id="accept-privacy" checked={hasAcceptedPrivacy} onChange={setHasAcceptedPrivacy} label="개인정보 처리방침에 동의합니다." href="/privacy" linkLabel="내용 보기" disabled={isSubmitting} />
                <p className="pl-7 text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)]">동의한 정책 버전과 시각은 계정에 기록됩니다.</p>
              </fieldset>

              <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-4 py-3 text-sm font-extrabold text-[#191919] shadow-[0_16px_32px_rgba(254,229,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#191919] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => void signInWithKakao()} disabled={isSubmitting || !hasAcceptedSignupRequirements}>
                {isSubmitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <span className="text-base" aria-hidden="true">●</span>}
                카카오로 시작하기
              </button>
              <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-4 py-3 text-sm font-extrabold text-[#2f6bbf] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bbf] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => { setEmailSignupOpen(true); setMessage(null); }} disabled={isSubmitting || !hasAcceptedSignupRequirements} aria-expanded={emailSignupOpen}>
                이메일로 가입
                <ArrowRight size={17} aria-hidden="true" />
              </button>

              {emailSignupOpen ? <div className="origin-top motion-safe:animate-[signup-email-form-in_220ms_cubic-bezier(0.22,1,0.36,1)]"><SignupEmailForm email={email} password={password} confirmPassword={confirmPassword} showPassword={showPassword} isSubmitting={isSubmitting} message={message} onEmailChange={setEmail} onPasswordChange={setPassword} onConfirmPasswordChange={setConfirmPassword} onTogglePassword={() => setShowPassword((value) => !value)} onSubmit={submit} /></div> : null}
              {message && !emailSignupOpen ? <AuthMessage message={message} /> : null}
            </div>
          ) : (
            <>
              <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-4 py-3 text-sm font-extrabold text-[#191919] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#191919] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => void signInWithKakao()} disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <span className="text-base" aria-hidden="true">●</span>}
                카카오로 로그인
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

                <Link href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`} className="justify-self-end text-xs font-bold text-[#2f6bbf] underline-offset-4 hover:underline">
                  비밀번호를 잊으셨나요?
                </Link>

            {message ? (
              <div className={`flex gap-2 rounded-xl border px-3.5 py-3 text-sm font-semibold leading-5 ${message.tone === "error" ? "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]"}`} role={message.tone === "error" ? "alert" : "status"}>
                {message.tone === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />}{message.text}
              </div>
            ) : null}

                <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_34px_rgba(47,107,191,0.22)] transition hover:-translate-y-0.5 hover:bg-[#3d7bd6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />처리 중</> : <>이메일로 로그인<ArrowRight size={17} aria-hidden="true" /></>}
                </button>
              </form>
            </>
          )}
            </>
          )}

          <p className="mt-5 border-t border-[var(--color-outline-variant)] pt-4 text-center text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{context.destination}</p>
        </section>
      </div>
    </main>
  );
}

function SignupEmailForm({
  email, password, confirmPassword, showPassword, isSubmitting, message,
  onEmailChange, onPasswordChange, onConfirmPasswordChange, onTogglePassword, onSubmit,
}: {
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  isSubmitting: boolean;
  message: Message;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="grid gap-4 rounded-[18px] border border-[#dbe8fb] bg-white p-4" onSubmit={onSubmit} noValidate>
      <label className="grid gap-2 text-sm font-extrabold text-[var(--color-on-surface)]">
        이메일
        <input className="h-12 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type="email" value={email} onChange={(event) => onEmailChange(event.currentTarget.value)} placeholder="name@example.com" required autoComplete="email" disabled={isSubmitting} aria-invalid={message?.tone === "error"} />
      </label>
      <label className="grid gap-2 text-sm font-extrabold text-[var(--color-on-surface)]">
        비밀번호
        <span className="relative">
          <input className="h-12 w-full rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 pr-12 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type={showPassword ? "text" : "password"} value={password} onChange={(event) => onPasswordChange(event.currentTarget.value)} placeholder="8자 이상" required minLength={8} autoComplete="new-password" disabled={isSubmitting} aria-invalid={message?.tone === "error"} />
          <button type="button" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)]" onClick={onTogglePassword} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"} disabled={isSubmitting}>
            {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
          </button>
        </span>
      </label>
      <label className="grid gap-2 text-sm font-extrabold text-[var(--color-on-surface)]">
        비밀번호 확인
        <input className="h-12 w-full rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.currentTarget.value)} placeholder="비밀번호 다시 입력" required minLength={8} autoComplete="new-password" disabled={isSubmitting} aria-invalid={message?.tone === "error" && password !== confirmPassword} />
      </label>
      {message ? <AuthMessage message={message} /> : null}
      <button className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_34px_rgba(47,107,191,0.22)] transition hover:-translate-y-0.5 hover:bg-[#3d7bd6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" type="submit" disabled={isSubmitting}>
        {isSubmitting ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />처리 중</> : <>인증번호 보내기<ArrowRight size={17} aria-hidden="true" /></>}
      </button>
    </form>
  );
}

function AuthMessage({ message }: { message: Exclude<Message, null> }) {
  return <div className={`flex gap-2 rounded-xl border px-3.5 py-3 text-sm font-semibold leading-5 ${message.tone === "error" ? "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]"}`} role={message.tone === "error" ? "alert" : "status"}>
    {message.tone === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={17} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />}{message.text}
  </div>;
}

function MinimumAgeConfirmationCheck({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
      <input id="confirm-minimum-age" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#2f6bbf]" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} />
      <label htmlFor="confirm-minimum-age" className="cursor-pointer text-[var(--color-on-surface)]">[필수] 만 14세 이상입니다.</label>
    </div>
  );
}

function PolicyConsentCheck({ id, checked, onChange, label, href, linkLabel, disabled }: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: string; href: string; linkLabel: string; disabled: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#2f6bbf]" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-3">
        <label htmlFor={id} className="cursor-pointer text-[var(--color-on-surface)]">[필수] {label}</label>
        <Link href={href} target="_blank" rel="noopener noreferrer" className="ml-1 whitespace-nowrap font-extrabold text-[#2f6bbf] underline underline-offset-2 sm:ml-0">{linkLabel}</Link>
      </div>
    </div>
  );
}
