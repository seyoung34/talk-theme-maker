"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Clock3, Coins, CreditCard, Gift, LoaderCircle, RefreshCw, ShieldCheck, Smartphone, Sparkles, Star, XCircle } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import type { AccountMeResponse, CreditCodeRedeemResponse, PayappPrepareResponse, PayappStatusResponse, PaymentStatus } from "@/lib/billing/apiTypes";
import { creditProducts, type CreditProductId } from "@/lib/billing/products";
import { getKnownCampaignKey, trackAnalyticsEvent, trackPurchaseOnce } from "@/lib/analytics/ga4";
import { readJsonResponse } from "@/lib/shared/api/http";
import { getSafeBillingReturnTo } from "@/lib/billing/returnTo";

type PaymentOutcome = { status: PaymentStatus | "checking"; credits?: number; message: string } | null;
type ChargePhase = "idle" | "preparing" | "redirecting";
type RedeemMessage = { tone: "success" | "error"; text: string } | null;

const MAX_PAYMENT_CHECKS = 4;

function normalizePhone(value: string) { return value.replace(/\D/g, "").slice(0, 11); }
function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
function isValidPhone(value: string) { return /^01[016789]\d{7,8}$/.test(normalizePhone(value)); }
function getPrepareError(payload: PayappPrepareResponse) {
  if (payload.reason === "invalid_product") return "충전 상품을 다시 선택해 주세요.";
  if (payload.reason === "invalid_phone") return "휴대폰번호를 정확히 입력해 주세요.";
  if (payload.reason === "payapp_config_missing") return "결제 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요.";
  if (payload.reason === "unauthenticated") return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  return "결제 요청을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function CreditsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<CreditProductId>("credit-4");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chargePhase, setChargePhase] = useState<ChargePhase>("idle");
  const [grantCode, setGrantCode] = useState("");
  const [redeemMessage, setRedeemMessage] = useState<RedeemMessage>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const returnTo = getSafeBillingReturnTo(searchParams.get("returnTo"));
  const campaignKey = getKnownCampaignKey(searchParams.get("campaign"));
  const creditsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (returnTo) params.set("returnTo", returnTo);
    if (campaignKey) params.set("campaign", campaignKey);
    const query = params.toString();
    return query ? `/credits?${query}` : "/credits";
  }, [campaignKey, returnTo]);

  const selectedProduct = useMemo(() => creditProducts.find((product) => product.id === selectedProductId) ?? creditProducts[1], [selectedProductId]);

  const refreshMe = useCallback(async () => {
    setPageError(null);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = await readJsonResponse<AccountMeResponse>(response);
      if (!response.ok) throw new Error();
      setMe(payload);
    } catch {
      setPageError("크레딧 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const checkPayment = useCallback(async (paymentId: string, automatic = false) => {
    setPaymentOutcome({ status: "checking", message: automatic ? "PayApp 결제 승인을 확인하고 있습니다." : "결제 결과를 다시 확인하고 있습니다." });
    for (let attempt = 0; attempt < MAX_PAYMENT_CHECKS; attempt += 1) {
      try {
        const response = await fetch(`/api/billing/payapp/status?paymentId=${encodeURIComponent(paymentId)}`, { cache: "no-store" });
        const payload = await readJsonResponse<PayappStatusResponse>(response);
        if (response.status === 401) {
          const callbackPath = `/credits?billing=payapp-return&paymentId=${encodeURIComponent(paymentId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
          router.push(`/login?returnTo=${encodeURIComponent(callbackPath)}&reason=billing`);
          return;
        }
        if (!response.ok || !payload.payment) {
          setPaymentOutcome({ status: "failed", message: "결제 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." });
          return;
        }
        const { status, credits } = payload.payment;
        if (status === "paid") {
          setPaymentOutcome({ status, credits, message: `${credits}크레딧이 충전되었습니다.` });
          const product = creditProducts.find((item) => item.credits === credits && item.amount === payload.payment?.amount);
          if (payload.payment.analytics_transaction_id) {
            trackPurchaseOnce(payload.payment.analytics_transaction_id, {
              currency: "KRW",
              value: payload.payment.amount,
              items: [{ item_id: product?.id ?? `credit-${credits}`, item_name: product?.name ?? `${credits} credits`, price: payload.payment.amount, quantity: 1 }],
            });
          }
          await refreshMe();
          router.replace(returnTo ?? "/credits", { scroll: false });
          return;
        }
        if (status === "failed" || status === "canceled") {
          setPaymentOutcome({ status, message: status === "canceled" ? "결제가 취소되었습니다. 결제된 금액은 없습니다." : "결제를 완료하지 못했습니다. 상품과 결제 정보를 확인한 뒤 다시 시도해 주세요." });
          return;
        }
        if (attempt < MAX_PAYMENT_CHECKS - 1) await new Promise((resolve) => window.setTimeout(resolve, 2500));
      } catch {
        setPaymentOutcome({ status: "failed", message: "네트워크 연결을 확인하고 결제 결과를 다시 조회해 주세요." });
        return;
      }
    }
    setPaymentOutcome({ status: "pending", message: "아직 결제 확인 중입니다. 잠시 후 다시 확인해 주세요." });
  }, [refreshMe, returnTo, router]);

  useEffect(() => {
    const paymentId = searchParams.get("paymentId");
    if (searchParams.get("billing") !== "payapp-return" || !paymentId) return;
    void checkPayment(paymentId, true);
  }, [checkPayment, searchParams]);

  useEffect(() => {
    trackAnalyticsEvent("credit_purchase_viewed", { entry_point: searchParams.get("entry") === "export_block" ? "export_block" : "menu", provider: "payapp" });
  }, [searchParams]);

  const chargeCredits = async () => {
    if (chargePhase !== "idle") return;
    if (!me?.user) {
      router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
      return;
    }
    if (!isValidPhone(phone)) {
      setPhoneError("010으로 시작하는 휴대폰번호를 정확히 입력해 주세요.");
      return;
    }
    setPhoneError(null);
    setPaymentOutcome(null);
    setChargePhase("preparing");
    try {
      const response = await fetch("/api/billing/payapp/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizePhone(phone), productId: selectedProduct.id, returnTo }),
      });
      const payload = await readJsonResponse<PayappPrepareResponse>(response);
      if (response.status === 401) {
        router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
        return;
      }
      if (!response.ok || !payload.checkoutUrl) throw new Error(getPrepareError(payload));
      trackAnalyticsEvent("begin_checkout", { currency: "KRW", value: selectedProduct.amount, provider: "payapp", items: [{ item_id: selectedProduct.id, item_name: selectedProduct.name, price: selectedProduct.amount, quantity: 1 }] });
      setChargePhase("redirecting");
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setPaymentOutcome({ status: "failed", message: error instanceof Error ? error.message : "결제 요청을 시작하지 못했습니다." });
      setChargePhase("idle");
    }
  };

  const paymentId = searchParams.get("paymentId");

  const redeemGrantCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRedeeming) return;
    if (!me?.user) {
      router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
      return;
    }
    const normalizedCode = grantCode.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,32}$/.test(normalizedCode)) {
      setRedeemMessage({ tone: "error", text: "영문, 숫자, 하이픈으로 구성된 코드를 입력해 주세요." });
      return;
    }
    setIsRedeeming(true);
    setRedeemMessage(null);
    try {
      const response = await fetch("/api/credits/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const payload = await readJsonResponse<CreditCodeRedeemResponse>(response);
      if (response.status === 401) {
        router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
        return;
      }
      if (!response.ok || payload.creditsGranted == null || payload.balance == null) throw new Error(payload.error ?? "코드를 처리하지 못했습니다.");
      setMe((current) => current ? { ...current, credits: payload.balance! } : current);
      setGrantCode("");
      setRedeemMessage({ tone: "success", text: `${payload.creditsGranted}크레딧이 지급되었습니다. 현재 잔액은 ${payload.balance}크레딧입니다.` });
      trackAnalyticsEvent("credit_redeem_completed", { credits_granted: payload.creditsGranted, source: campaignKey ?? "direct" });
      if (returnTo) router.replace(returnTo);
    } catch (error) {
      setRedeemMessage({ tone: "error", text: error instanceof Error ? error.message : "코드를 처리하지 못했습니다." });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_18%,#ffffff_42%,#f7fbff_70%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/credits" />
      <div className="relative mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-11">
        <Star className="pointer-events-none absolute left-[3%] top-12 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Sparkles className="pointer-events-none absolute right-[7%] top-20 hidden h-7 w-7 text-[#fbbf24] lg:block" />

        <Link href="/account" className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#dbe8fb] bg-white/82 px-3.5 py-2 text-sm font-extrabold text-[var(--color-on-surface-variant)] shadow-sm backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"><ArrowLeft size={17} aria-hidden="true" />마이페이지</Link>
        <header className="relative mb-7 overflow-hidden rounded-[32px] border border-[#dbe8fb] bg-white/84 px-6 py-7 shadow-[0_24px_70px_rgba(47,107,191,0.1)] backdrop-blur sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(254,229,0,0.24),transparent_56%)]" />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-[#f7fbff] px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">
            <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
            Credit Store
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[34px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[44px]">
            필요한 만큼 충전하고
            <span className="block text-[#2f6bbf]">바로 Export 하세요.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-[16px]">
            상품을 고른 뒤 PayApp에서 결제를 완료하면 크레딧이 즉시 반영됩니다. 이벤트 코드가 있다면
            아래에서 함께 등록할 수 있습니다.
          </p>
        </header>

        {pageError ? <div className="mb-5 flex items-center justify-between gap-3 rounded-[22px] border border-[#f1b7b1] bg-[var(--color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert"><span className="flex items-center gap-2"><AlertCircle size={17} aria-hidden="true" />{pageError}</span><button type="button" className="underline shrink-0 underline-offset-2" onClick={() => void refreshMe()}>다시 시도</button></div> : null}
        {paymentOutcome ? <PaymentNotice outcome={paymentOutcome} onRetry={paymentId ? () => void checkPayment(paymentId) : undefined} /> : null}



        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start mb-5">
          <section aria-labelledby="product-title">
            <div className="mb-4 flex items-end justify-between gap-4"><div><h2 id="product-title" className="text-xl font-extrabold">충전 상품 선택</h2><p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">크레딧에는 유효기간이 없습니다.</p></div><div className="rounded-full border border-[#dbe8fb] bg-white/82 px-3.5 py-2 text-right shadow-sm"><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3d7bd6]">보유 크레딧</span><strong className="ml-2 text-lg font-extrabold text-[#2f6bbf]">{isLoading ? "—" : me?.credits ?? 0}</strong></div></div>
            <fieldset className="grid gap-3 sm:grid-cols-3" disabled={chargePhase !== "idle"}>
              <legend className="sr-only">크레딧 상품</legend>
              {creditProducts.map((product) => {
                const selected = selectedProduct.id === product.id;
                const savings = product.credits * 3000 - product.amount;
                return (
                  <label key={product.id} className={`relative flex min-h-52 cursor-pointer flex-col overflow-hidden rounded-[28px] border bg-white/88 p-5 shadow-[0_18px_42px_rgba(47,107,191,0.08)] transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-secondary)] ${selected ? "border-[#2f6bbf] -translate-y-1 shadow-[0_26px_60px_rgba(47,107,191,0.18)]" : "border-[#dbe8fb] hover:-translate-y-1 hover:border-[#9bc0f5]"}`}>
                    <span className={`pointer-events-none absolute inset-x-0 top-0 h-24 ${selected ? "bg-[linear-gradient(180deg,rgba(232,241,255,0.98),rgba(255,255,255,0))]" : "bg-[linear-gradient(180deg,rgba(247,251,255,0.95),rgba(255,255,255,0))]"}`} />
                    <input className="sr-only" type="radio" name="credit-product" value={product.id} checked={selected} onChange={() => setSelectedProductId(product.id)} />
                    <span className={`absolute right-4 top-4 grid size-5 place-items-center rounded-full border ${selected ? "border-[var(--color-secondary)] bg-[var(--color-secondary)] text-white" : "border-[var(--color-outline-variant)]"}`}>{selected ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}</span>
                    {"badge" in product ? <span className="mb-8 w-fit rounded-full bg-[#fff2bd] px-2.5 py-1 text-[10px] font-extrabold text-[#665300]">{product.badge}</span> : <span className="mb-8 h-5" />}
                    <strong className="text-2xl font-extrabold">{product.label}</strong>
                    <span className="mt-1 text-sm font-semibold text-[var(--color-on-surface-variant)]">Export {product.credits}회</span>
                    <strong className="mt-auto pt-5 text-2xl font-extrabold">{product.amount.toLocaleString("ko-KR")}원</strong>
                    <span className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">크레딧당 {Math.round(product.amount / product.credits).toLocaleString("ko-KR")}원{savings > 0 ? ` · ${savings.toLocaleString("ko-KR")}원 절약` : ""}</span>
                  </label>
                );
              })}
            </fieldset>
          </section>

          <aside className="rounded-[30px] border border-[#dbe8fb] bg-white/88 p-5 shadow-[0_24px_68px_rgba(47,107,191,0.12)] backdrop-blur lg:sticky lg:top-24" aria-labelledby="checkout-title">
            <div className="flex items-center gap-2"><CreditCard size={19} className="text-[var(--color-secondary)]" aria-hidden="true" /><h2 id="checkout-title" className="text-lg font-extrabold">결제 정보</h2></div>
            <dl className="mt-5 grid gap-3 rounded-[24px] border border-[#e3ecf7] bg-[#f7fbff] p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="font-semibold text-[var(--color-on-surface-variant)]">선택 상품</dt><dd className="font-extrabold">{selectedProduct.label}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-semibold text-[var(--color-on-surface-variant)]">지급 크레딧</dt><dd className="font-extrabold">{selectedProduct.credits}크레딧</dd></div>
              <div className="flex items-end justify-between gap-4 pt-2"><dt className="font-extrabold">결제 금액</dt><dd className="text-xl font-extrabold">{selectedProduct.amount.toLocaleString("ko-KR")}원</dd></div>
            </dl>

            {me?.user ? (
              <>
                <label htmlFor="billing-phone" className="block mt-5 text-sm font-extrabold">결제 요청 휴대폰번호</label>
                <div className="relative mt-2"><Smartphone className="absolute left-3 top-3.5 text-[var(--color-outline)]" size={18} aria-hidden="true" /><input id="billing-phone" className="h-12 w-full rounded-xl border border-[var(--color-outline-variant)] bg-white pl-10 pr-3 text-sm font-semibold outline-none transition placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" inputMode="numeric" autoComplete="tel" placeholder="010-1234-5678" value={formatPhone(phone)} onChange={(event) => { setPhone(normalizePhone(event.currentTarget.value)); setPhoneError(null); }} onBlur={() => { if (phone && !isValidPhone(phone)) setPhoneError("010으로 시작하는 휴대폰번호를 정확히 입력해 주세요."); }} aria-describedby="phone-help phone-error" aria-invalid={Boolean(phoneError)} disabled={chargePhase !== "idle"} /></div>
                <p id="phone-help" className="mt-2 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">PayApp 결제 요청을 전송하는 용도로만 사용합니다.</p>
                {phoneError ? <p id="phone-error" className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[var(--color-error)]" role="alert"><AlertCircle size={14} aria-hidden="true" />{phoneError}</p> : null}
                <button type="button" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#fee500] px-4 py-3 text-sm font-extrabold text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => void chargeCredits()} disabled={chargePhase !== "idle" || isLoading}>
                  {chargePhase === "preparing" ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />결제 요청 준비 중</> : chargePhase === "redirecting" ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />PayApp으로 이동 중</> : <>{selectedProduct.amount.toLocaleString("ko-KR")}원 결제하기</>}
                </button>
              </>
            ) : (
              <div className="mt-5 rounded-[24px] bg-[#f7fbff] p-4"><p className="text-sm font-extrabold">결제하려면 로그인이 필요합니다.</p><Link href={`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`} className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-[#2f6bbf] px-4 py-2.5 text-sm font-extrabold text-white">로그인</Link></div>
            )}

            <div className="mt-4 flex items-start gap-2 text-[11px] font-semibold leading-5 text-[var(--color-outline)]"><ShieldCheck className="mt-0.5 shrink-0" size={14} aria-hidden="true" />결제는 외부 PayApp 화면에서 안전하게 진행됩니다.</div>
          </aside>
        </div>

        <section className="mb-6 grid gap-5 rounded-[30px] border border-[#dbe8fb] bg-white/88 p-5 shadow-[0_20px_52px_rgba(47,107,191,0.1)] backdrop-blur sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] sm:items-center sm:p-6" aria-labelledby="grant-code-title">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff2bd] text-[#665300]"><Gift size={20} aria-hidden="true" /></span>
            <div><h2 id="grant-code-title" className="text-lg font-extrabold">크레딧 지급 코드</h2><p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">이벤트나 캠페인에서 받은 코드를 등록하면 크레딧이 즉시 지급됩니다. 코드는 계정당 한 번만 사용할 수 있습니다.</p></div>
          </div>
          {me?.user ? (
            <form className="grid gap-2" onSubmit={redeemGrantCode} noValidate>
              <label htmlFor="grant-code" className="text-xs font-extrabold text-[var(--color-on-surface-variant)]">지급 코드</label>
              <div className="flex gap-2">
                <input id="grant-code" className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-sm font-extrabold uppercase tracking-[0.08em] outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" value={grantCode} onChange={(event) => { setGrantCode(event.currentTarget.value.toUpperCase()); setRedeemMessage(null); }} maxLength={32} autoComplete="off" spellCheck={false} disabled={isRedeeming} aria-invalid={redeemMessage?.tone === "error"} aria-describedby="grant-code-message" />
                <button type="submit" className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#2f6bbf] px-4 py-3 text-sm font-extrabold text-white shadow-[0_16px_30px_rgba(47,107,191,0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" disabled={isRedeeming || !grantCode.trim()}>{isRedeeming ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : null}등록</button>
              </div>
              {redeemMessage ? <p id="grant-code-message" className={`flex items-start gap-1.5 text-xs font-bold leading-5 ${redeemMessage.tone === "success" ? "text-[#155d45]" : "text-[var(--color-error)]"}`} role={redeemMessage.tone === "success" ? "status" : "alert"}>{redeemMessage.tone === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} aria-hidden="true" /> : <AlertCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />}{redeemMessage.text}</p> : null}
            </form>
          ) : <Link href={`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`} className="flex min-h-12 items-center justify-center rounded-full bg-[#2f6bbf] px-4 py-3 text-sm font-extrabold text-white">로그인하고 코드 등록</Link>}
        </section>

      </div>
    </main>
  );
}

function PaymentNotice({ outcome, onRetry }: { outcome: NonNullable<PaymentOutcome>; onRetry?: () => void }) {
  const config = outcome.status === "paid" ? { Icon: CheckCircle2, className: "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]", title: "충전이 완료되었습니다" }
    : outcome.status === "pending" || outcome.status === "checking" ? { Icon: Clock3, className: "border-[#e4cc76] bg-[#fff8d7] text-[#665300]", title: outcome.status === "checking" ? "결제 결과 확인 중" : "결제 승인 대기 중" }
      : outcome.status === "canceled" ? { Icon: XCircle, className: "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]", title: "결제가 취소되었습니다" }
        : { Icon: AlertCircle, className: "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]", title: "결제를 완료하지 못했습니다" };
  return <div className={`mb-6 flex items-start gap-3 rounded-[22px] border px-4 py-3.5 shadow-sm ${config.className}`} role={outcome.status === "failed" ? "alert" : "status"}><config.Icon className={outcome.status === "checking" ? "mt-0.5 shrink-0 animate-pulse" : "mt-0.5 shrink-0"} size={19} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{config.title}</p><p className="mt-0.5 text-xs font-semibold leading-5">{outcome.message}</p>{outcome.status === "paid" ? <Link href="/account" className="mt-2 inline-block text-xs font-extrabold underline underline-offset-2">마이페이지에서 잔액 확인</Link> : null}</div>{onRetry && (outcome.status === "pending" || outcome.status === "failed") ? <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold underline underline-offset-2" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />다시 확인</button> : null}</div>;
}
