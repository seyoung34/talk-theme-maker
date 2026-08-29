"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, Clock3, CreditCard, Gift, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import type { AccountMeResponse, BillingPaymentStatusResponse, BillingPrepareResponse, CreditCodeRedeemResponse, PaymentStatus } from "@/lib/billing/apiTypes";
import { creditProducts, singleCreditPrice, type CreditProductId } from "@/lib/billing/products";
import { getKnownCampaignKey, trackAnalyticsEvent, trackPurchaseOnce } from "@/lib/analytics/ga4";
import { readJsonResponse } from "@/lib/shared/api/http";
import { getSafeBillingReturnTo, type BillingReturnTo } from "@/lib/billing/returnTo";
import { claimSignupBonusFromClient } from "@/lib/billing/signupBonusClient";

type PaymentOutcome = { status: PaymentStatus | "checking" | "returned"; credits?: number; message: string } | null;
type ChargePhase = "idle" | "preparing" | "redirecting";
type RedeemMessage = { tone: "success" | "error"; text: string } | null;

const MAX_PAYMENT_CHECKS = 4;
const GROBLE_PAYMENT_SESSION_KEY = "talktheme:billing:groble:v1";
const REFUND_REVIEW_MESSAGE = "환불과 크레딧 사용 내역을 조정하고 있습니다. 고객지원에 문의해 주세요.";
const REFUND_REQUESTED_MESSAGE = "환불 요청을 확인하고 있습니다. 처리 결과는 고객지원에서 확인해 주세요.";

function getPrepareError(payload: BillingPrepareResponse) {
  if (payload.reason === "invalid_product") return "충전 상품을 다시 선택해 주세요.";
  if (payload.reason === "billing_hold") return "환불 조정이 끝난 뒤 다시 결제해 주세요.";
  if (payload.reason === "checkout_temporarily_disabled") return "결제 기능을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.";
  if (payload.reason === "unauthenticated") return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  return "결제 요청을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function readGroblePaymentSession() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(GROBLE_PAYMENT_SESSION_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return null;
    const session = value as { version?: unknown; paymentId?: unknown; returnTo?: unknown; startedAt?: unknown };
    const startedAt = typeof session.startedAt === "number" ? session.startedAt : Number.NaN;
    if (
      session.version !== 1
      || typeof session.paymentId !== "string"
      || !Number.isFinite(startedAt)
      || startedAt > Date.now() + 60_000
      || startedAt < Date.now() - 7 * 24 * 60 * 60 * 1000
    ) return null;
    return { paymentId: session.paymentId, returnTo: typeof session.returnTo === "string" ? session.returnTo : null };
  } catch {
    return null;
  }
}

function clearGroblePaymentSession() {
  try {
    window.sessionStorage.removeItem(GROBLE_PAYMENT_SESSION_KEY);
  } catch {
    // Private-mode browsers can refuse session storage; the payment result does not depend on it.
  }
}

function getProductBadgeClassName(tone: "primary" | "highlight") {
  return tone === "primary"
    ? "border-[#b8d2ff] bg-[#eaf2ff] text-[#1d4ed8]"
    : "border-[#e6c968] bg-[#fff0a8] text-[#5f4800]";
}

export default function CreditsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<CreditProductId>("credit-2");
  const [pageError, setPageError] = useState<string | null>(null);
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>(null);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [activeReturnTo, setActiveReturnTo] = useState<BillingReturnTo | undefined>();
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
  const isGrobleReturn = searchParams.get("billing") === "groble-return";

  const refreshMe = useCallback(async () => {
    setPageError(null);
    try {
      const bonusClaim = await claimSignupBonusFromClient().catch(() => null);
      if (bonusClaim?.granted && bonusClaim.campaignKey) {
        trackAnalyticsEvent("signup_bonus_granted", { campaign_key: bonusClaim.campaignKey, credits_granted: bonusClaim.creditsGranted ?? 0 });
      }
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

  const restoreCheckoutSession = useCallback(() => {
    if (isGrobleReturn) return;
    const session = readGroblePaymentSession();
    if (!session) return;
    setActivePaymentId(session.paymentId);
    setActiveReturnTo(getSafeBillingReturnTo(session.returnTo) ?? undefined);
    setPaymentOutcome((current) => current ?? {
      status: "returned",
      message: "결제창에서 돌아왔습니다. 결제하지 않았다면 다시 시도해 주세요.",
    });
  }, [isGrobleReturn]);

  useEffect(() => {
    restoreCheckoutSession();
  }, [restoreCheckoutSession]);

  const checkPayment = useCallback(async (paymentId: string, automatic = false, returnDestination = returnTo) => {
    setPaymentOutcome({ status: "checking", message: automatic ? "그로블 결제 승인을 확인하고 있습니다." : "결제 결과를 다시 확인하고 있습니다." });
    for (let attempt = 0; attempt < MAX_PAYMENT_CHECKS; attempt += 1) {
      try {
        const response = await fetch(`/api/billing/payments/status?paymentId=${encodeURIComponent(paymentId)}`, { cache: "no-store" });
        const payload = await readJsonResponse<BillingPaymentStatusResponse>(response);
        if (response.status === 401) {
          const callbackPath = `/credits?billing=groble-return${returnDestination ? `&returnTo=${encodeURIComponent(returnDestination)}` : ""}`;
          router.push(`/login?returnTo=${encodeURIComponent(callbackPath)}&reason=billing`);
          return;
        }
        if (!response.ok || !payload.payment) {
          setPaymentOutcome({ status: "failed", message: "결제 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." });
          return;
        }
        const { status, credits, refund_status: refundStatus } = payload.payment;
        // The purchase settled, so record and clear it before reporting any refund follow-up.
        if (status === "paid") {
          const product = creditProducts.find((item) => item.credits === credits && item.amount === payload.payment?.amount);
          if (payload.payment.analytics_transaction_id) {
            trackPurchaseOnce(payload.payment.analytics_transaction_id, {
              currency: "KRW",
              value: payload.payment.amount,
              items: [{ item_id: product?.id ?? `credit-${credits}`, item_name: product?.name ?? `${credits} credits`, price: payload.payment.amount, quantity: 1 }],
            });
          }
          await refreshMe();
          clearGroblePaymentSession();
          if (refundStatus === "review_required") {
            setPaymentOutcome({ status: "failed", message: REFUND_REVIEW_MESSAGE });
            return;
          }
          if (refundStatus === "requested") {
            setPaymentOutcome({ status: "pending", message: REFUND_REQUESTED_MESSAGE });
            return;
          }
          setPaymentOutcome({ status, credits, message: `크레딧 ${credits}개가 충전되었습니다.` });
          router.replace(returnDestination ?? "/credits", { scroll: false });
          return;
        }
        if (status === "failed" || status === "canceled") {
          clearGroblePaymentSession();
          setPaymentOutcome({ status, message: status === "canceled" && refundStatus === "refunded" ? "결제 환불이 완료되어 구매 크레딧이 회수되었습니다." : status === "canceled" ? "결제가 취소되었습니다. 결제된 금액은 없습니다." : "결제를 완료하지 못했습니다. 상품과 결제 정보를 확인한 뒤 다시 시도해 주세요." });
          return;
        }
        if (refundStatus === "review_required") {
          clearGroblePaymentSession();
          setPaymentOutcome({ status: "failed", message: REFUND_REVIEW_MESSAGE });
          await refreshMe();
          return;
        }
        if (refundStatus === "requested") {
          setPaymentOutcome({ status: "pending", message: REFUND_REQUESTED_MESSAGE });
          await refreshMe();
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
    if (searchParams.get("billing") !== "groble-return") return;
    const session = readGroblePaymentSession();
    if (!session) {
      setPaymentOutcome({ status: "pending", message: "결제창에서 돌아왔습니다. 웹훅 반영이 늦을 수 있으니 잠시 후 잔액을 다시 확인해 주세요." });
      void refreshMe();
      return;
    }
    setActivePaymentId(session.paymentId);
    const sessionReturnTo = getSafeBillingReturnTo(session.returnTo);
    setActiveReturnTo(sessionReturnTo);
    void checkPayment(session.paymentId, true, sessionReturnTo);
  }, [checkPayment, refreshMe, searchParams]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      const navigation = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const returnedByHistory = event.persisted || navigation?.type === "back_forward";
      if (!returnedByHistory) return;

      // The checkout page is a full navigation. When the browser restores this page from
      // history, the redirecting state must not leave the payment button disabled forever.
      setChargePhase("idle");
      restoreCheckoutSession();
      void refreshMe();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [refreshMe, restoreCheckoutSession]);

  useEffect(() => {
    trackAnalyticsEvent("credit_purchase_viewed", { entry_point: searchParams.get("entry") === "export_block" ? "export_block" : "menu", provider: "groble" });
  }, [searchParams]);

  const chargeCredits = async () => {
    if (chargePhase !== "idle") return;
    if (!me?.user) {
      router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
      return;
    }
    if (me.billingHold) {
      setPaymentOutcome({ status: "failed", message: "환불 조정이 끝난 뒤 다시 결제해 주세요." });
      return;
    }
    setPaymentOutcome(null);
    setChargePhase("preparing");
    try {
      const response = await fetch("/api/billing/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.id }),
      });
      const payload = await readJsonResponse<BillingPrepareResponse>(response);
      if (response.status === 401) {
        router.push(`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`);
        return;
      }
      if (!response.ok || !payload.checkoutUrl || !payload.paymentId) throw new Error(getPrepareError(payload));
      window.sessionStorage.setItem(GROBLE_PAYMENT_SESSION_KEY, JSON.stringify({ version: 1, paymentId: payload.paymentId, returnTo, startedAt: Date.now() }));
      setActivePaymentId(payload.paymentId);
      setActiveReturnTo(returnTo);
      trackAnalyticsEvent("begin_checkout", { currency: "KRW", value: selectedProduct.amount, provider: "groble", items: [{ item_id: selectedProduct.id, item_name: selectedProduct.name, price: selectedProduct.amount, quantity: 1 }] });
      setChargePhase("redirecting");
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setPaymentOutcome({ status: "failed", message: error instanceof Error ? error.message : "결제 요청을 시작하지 못했습니다." });
      setChargePhase("idle");
    }
  };

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
      setRedeemMessage({ tone: "success", text: `크레딧 ${payload.creditsGranted}개가 지급되었습니다. 현재 잔액은 크레딧 ${payload.balance}개입니다.` });
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
        <Link href="/account" className="mb-4 inline-flex items-center gap-1.5 px-0 py-1 text-sm font-extrabold text-[var(--color-on-surface-variant)] transition hover:text-[#2f6bbf] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"><ArrowLeft size={17} aria-hidden="true" />마이페이지</Link>
        <header className="mb-7 flex flex-col gap-4 border-b border-[#dbe8fb] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#3d7bd6]">크레딧 충전</p>
            <h1 className="mt-1 max-w-3xl font-[var(--font-display)] text-[30px] font-semibold leading-tight tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[38px]">
              테마 다운로드에 필요한 크레딧을 충전하세요.
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">
              테마 다운로드 1회마다 크레딧 1개를 사용해요. 결제 후 자동으로 반영되고, 유효기간은 없습니다.
            </p>
          </div>
          <div className="inline-flex w-fit shrink-0 items-baseline gap-2 rounded-2xl border border-[#cfe0ff] bg-white/90 px-4 py-2.5 text-right shadow-sm sm:self-end">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[#3d7bd6]">보유 크레딧</span>
            <strong className="text-2xl font-extrabold tracking-[-0.04em] text-[#2f6bbf]">{isLoading ? "—" : me?.credits ?? 0}</strong>
          </div>
        </header>

        {pageError ? <div className="mb-5 flex items-center justify-between gap-3 rounded-[22px] border border-[#f1b7b1] bg-[var(--color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert"><span className="flex items-center gap-2"><AlertCircle size={17} aria-hidden="true" />{pageError}</span><button type="button" className="underline shrink-0 underline-offset-2" onClick={() => void refreshMe()}>다시 시도</button></div> : null}
        {paymentOutcome ? <PaymentNotice outcome={paymentOutcome} onRetry={activePaymentId ? () => void checkPayment(activePaymentId, false, activeReturnTo) : undefined} /> : null}



        <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section aria-labelledby="product-title">
            <div className="mb-3 flex items-end justify-between gap-4"><div><h2 id="product-title" className="text-xl font-extrabold">충전 상품 선택</h2><p className="mt-1 text-xs font-semibold text-[var(--color-on-surface-variant)]">필요한 만큼 선택하세요.</p></div></div>
            <fieldset className="grid gap-3 sm:grid-cols-3" disabled={chargePhase !== "idle"}>
              <legend className="sr-only">크레딧 상품</legend>
              {creditProducts.map((product) => {
                const selected = selectedProduct.id === product.id;
                const savings = product.credits * singleCreditPrice - product.amount;
                const discountRate = savings > 0 ? Math.round((savings / (product.credits * singleCreditPrice)) * 100) : 0;
                const badge = "badge" in product ? product.badge : null;
                return (
                  <label key={product.id} className={`relative flex min-h-44 cursor-pointer flex-col overflow-hidden rounded-[22px] border bg-white/90 p-4 shadow-[0_10px_26px_rgba(47,107,191,0.06)] transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-secondary)] sm:p-5 ${selected ? "-translate-y-0.5 border-[#2f6bbf] shadow-[0_14px_34px_rgba(47,107,191,0.14)]" : "border-[#dbe8fb] hover:-translate-y-0.5 hover:border-[#9bc0f5]"}`}>
                    <span className={`pointer-events-none absolute inset-x-0 top-0 h-20 ${selected ? "bg-[linear-gradient(180deg,rgba(232,241,255,0.98),rgba(255,255,255,0))]" : "bg-[linear-gradient(180deg,rgba(247,251,255,0.95),rgba(255,255,255,0))]"}`} />
                    <input className="sr-only" type="radio" name="credit-product" value={product.id} checked={selected} onChange={() => setSelectedProductId(product.id)} />
                    <div className="relative flex min-h-6 items-start justify-between gap-2">
                      {badge ? <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[11px] font-black leading-none ${getProductBadgeClassName(badge.tone)}`}>{badge.label}</span> : <span className="h-6" aria-hidden="true" />}
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[var(--color-secondary)] bg-[var(--color-secondary)] text-white" : "border-[var(--color-outline-variant)] bg-white/70"}`}>{selected ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}</span>
                    </div>
                    <strong className="relative mt-3 text-[21px] font-extrabold tracking-[-0.03em] sm:text-2xl">{product.label}</strong>
                    <span className="relative mt-0.5 text-sm font-semibold text-[var(--color-on-surface-variant)]">테마 다운로드 {product.credits}회</span>
                    <div className="relative mt-auto pt-4">
                      <strong className="block text-2xl font-extrabold">{product.amount.toLocaleString("ko-KR")}원</strong>
                      <span className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)] sm:text-xs">크레딧당 {Math.round(product.amount / product.credits).toLocaleString("ko-KR")}원{savings > 0 ? <span className="font-extrabold text-[#2f6bbf]">· 약 {discountRate}% 할인</span> : null}</span>
                    </div>
                  </label>
                );
              })}
            </fieldset>
          </section>

          <aside className="rounded-[22px] border border-[#dbe8fb] bg-white/90 p-4 shadow-[0_12px_34px_rgba(47,107,191,0.08)] backdrop-blur lg:sticky lg:top-24 sm:p-5" aria-labelledby="checkout-title">
            <div className="flex items-center gap-2"><CreditCard size={18} className="text-[var(--color-secondary)]" aria-hidden="true" /><h2 id="checkout-title" className="text-base font-extrabold">결제 정보</h2></div>
            <dl className="mt-4 grid gap-2.5 rounded-[18px] border border-[#e3ecf7] bg-[#f7fbff] p-3.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="font-semibold text-[var(--color-on-surface-variant)]">선택 상품</dt><dd className="font-extrabold">{selectedProduct.label}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-semibold text-[var(--color-on-surface-variant)]">지급 크레딧</dt><dd className="font-extrabold">크레딧 {selectedProduct.credits}개</dd></div>
              <div className="flex items-end justify-between gap-4 pt-2"><dt className="font-extrabold">결제 금액</dt><dd className="text-xl font-extrabold">{selectedProduct.amount.toLocaleString("ko-KR")}원</dd></div>
            </dl>

            {me?.user ? (
              <>
                {me.billingHold ? <div className="mt-5 rounded-2xl border border-[#e4cc76] bg-[#fff8d7] p-3 text-xs font-bold leading-5 text-[#665300]" role="alert">환불 조정 중인 계정입니다. 새 결제나 내보내기 전에 <Link href="/support" className="underline underline-offset-2">고객지원</Link>에 문의해 주세요.</div> : null}
                <button type="button" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#fee500] px-4 py-3 text-sm font-extrabold text-[#191600] shadow-none transition hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" onClick={() => void chargeCredits()} disabled={chargePhase !== "idle" || isLoading || me.billingHold}>
                  {chargePhase === "preparing" ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />결제 요청 준비 중</> : chargePhase === "redirecting" ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />그로블로 이동 중</> : <>{selectedProduct.amount.toLocaleString("ko-KR")}원 결제하기</>}
                </button>
                <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]"><ShieldCheck className="mt-0.5 shrink-0" size={14} aria-hidden="true" />결제 후 크레딧이 자동으로 반영됩니다. 결제는 그로블 결제창에서 진행됩니다.</p>
                <p className="mt-3 text-[11px] font-semibold leading-5 text-[var(--color-outline)]">결제하면 <Link href="/terms" className="underline underline-offset-2">이용약관</Link>과 <Link href="/refund" className="underline underline-offset-2">환불·청약철회 안내</Link>를 확인한 것으로 처리됩니다. 문의는 <Link href="/support" className="underline underline-offset-2">고객지원</Link>에서 접수할 수 있습니다.</p>
              </>
            ) : (
              <div className="mt-5 rounded-[18px] bg-[#f7fbff] p-4"><p className="text-sm font-extrabold">결제하려면 로그인이 필요합니다.</p><Link href={`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[#2f6bbf] px-4 py-2.5 text-sm font-extrabold text-white">로그인</Link></div>
            )}

            <p className="mt-3 text-[11px] font-semibold leading-5 text-[var(--color-outline)]">결제 완료 후 이 페이지로 돌아오면 잔액을 확인할 수 있습니다.</p>
          </aside>
        </div>

        <details className="group mb-6 border-y border-[#dbe8fb]">
          <summary className="flex cursor-pointer list-none items-center gap-3 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] [&::-webkit-details-marker]:hidden">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff2bd] text-[#665300]"><Gift size={18} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><strong id="grant-code-title" className="block text-sm font-extrabold">이벤트 코드가 있나요?</strong><span className="mt-0.5 block text-xs font-semibold text-[var(--color-on-surface-variant)]">코드를 등록하면 크레딧을 받을 수 있어요.</span></span>
            <ChevronDown className="shrink-0 text-[#64748b] transition-transform group-open:rotate-180" size={18} aria-hidden="true" />
          </summary>
          <div className="grid gap-4 pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] sm:items-end">
            <p className="text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)]">이벤트나 캠페인에서 받은 코드를 등록하면 크레딧이 즉시 지급됩니다. 코드는 계정당 한 번만 사용할 수 있습니다.</p>
            {me?.user ? (
              <form className="grid gap-2" onSubmit={redeemGrantCode} noValidate>
                <label htmlFor="grant-code" className="text-xs font-extrabold text-[var(--color-on-surface-variant)]">지급 코드</label>
                <div className="flex gap-2">
                  <input id="grant-code" className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-outline-variant)] bg-white px-3.5 text-sm font-extrabold uppercase tracking-[0.08em] outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-outline)] focus:border-[var(--color-secondary)] focus:ring-3 focus:ring-[var(--color-secondary-container)] disabled:bg-[var(--color-surface-low)]" value={grantCode} onChange={(event) => { setGrantCode(event.currentTarget.value.toUpperCase()); setRedeemMessage(null); }} maxLength={32} autoComplete="off" spellCheck={false} disabled={isRedeeming} aria-invalid={redeemMessage?.tone === "error"} aria-describedby="grant-code-message" />
                  <button type="submit" className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2f6bbf] px-4 py-2.5 text-sm font-extrabold text-white shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-55" disabled={isRedeeming || !grantCode.trim()}>{isRedeeming ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : null}등록</button>
                </div>
                {redeemMessage ? <p id="grant-code-message" className={`flex items-start gap-1.5 text-xs font-bold leading-5 ${redeemMessage.tone === "success" ? "text-[#155d45]" : "text-[var(--color-error)]"}`} role={redeemMessage.tone === "success" ? "status" : "alert"}>{redeemMessage.tone === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} aria-hidden="true" /> : <AlertCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />}{redeemMessage.text}</p> : null}
              </form>
            ) : <Link href={`/login?returnTo=${encodeURIComponent(creditsPath)}&reason=billing`} className="flex min-h-11 items-center justify-center rounded-xl bg-[#2f6bbf] px-4 py-2.5 text-sm font-extrabold text-white">로그인하고 코드 등록</Link>}
          </div>
        </details>

      </div>
    </main>
  );
}

function PaymentNotice({ outcome, onRetry }: { outcome: NonNullable<PaymentOutcome>; onRetry?: () => void }) {
  const config = outcome.status === "paid" ? { Icon: CheckCircle2, className: "border-[#9ed5c1] bg-[#e4f6ee] text-[#155d45]", title: "충전이 완료되었습니다" }
    : outcome.status === "returned" ? { Icon: ArrowLeft, className: "border-[#b8d2ff] bg-[#eaf2ff] text-[#1d4ed8]", title: "결제창에서 돌아왔습니다" }
      : outcome.status === "pending" || outcome.status === "checking" ? { Icon: Clock3, className: "border-[#e4cc76] bg-[#fff8d7] text-[#665300]", title: outcome.status === "checking" ? "결제 결과 확인 중" : "결제 승인 대기 중" }
      : outcome.status === "canceled" ? { Icon: XCircle, className: "border-[var(--color-outline-variant)] bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)]", title: "결제가 취소되었습니다" }
        : { Icon: AlertCircle, className: "border-[#f1b7b1] bg-[var(--color-error-container)] text-[var(--color-on-error-container)]", title: "결제를 완료하지 못했습니다" };
  return <div className={`mb-6 flex items-start gap-3 rounded-[22px] border px-4 py-3.5 shadow-sm ${config.className}`} role={outcome.status === "failed" ? "alert" : "status"}><config.Icon className={outcome.status === "checking" ? "mt-0.5 shrink-0 animate-pulse" : "mt-0.5 shrink-0"} size={19} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{config.title}</p><p className="mt-0.5 text-xs font-semibold leading-5">{outcome.message}</p>{outcome.status === "paid" ? <Link href="/account" className="mt-2 inline-block text-xs font-extrabold underline underline-offset-2">마이페이지에서 잔액 확인</Link> : null}</div>{onRetry && (outcome.status === "pending" || outcome.status === "failed" || outcome.status === "returned") ? <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold underline underline-offset-2" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />{outcome.status === "returned" ? "상태 확인" : "다시 확인"}</button> : null}</div>;
}
