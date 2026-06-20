"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/components/layout/SiteHeader";
import { createClient } from "@/lib/supabase/client";

type MePayload = {
  user: { id: string; email?: string } | null;
  profile: { email?: string; display_name?: string | null; avatar_url?: string | null; provider?: string | null } | null;
  credits: number;
  exports: Array<{
    id: string;
    platform: string;
    export_mode: string;
    status: string;
    credit_cost: number;
    file_name?: string | null;
    error?: string | null;
    created_at: string;
  }>;
};

type PayappPreparePayload = {
  paymentId?: string;
  checkoutUrl?: string;
  amount?: number;
  credits?: number;
  error?: string;
  reason?: string;
};

type PayappStatusPayload = {
  payment?: {
    id: string;
    status: "pending" | "paid" | "failed" | "canceled";
    amount: number;
    credits: number;
  };
  error?: string;
};

export default function AccountClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<MePayload | null>(null);
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCharging, setIsCharging] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);

  const refreshMe = async () => {
    const response = await fetch("/api/me", { cache: "no-store" });
    const payload = (await response.json()) as MePayload;
    setMe(payload);
    setIsLoading(false);
  };

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    const billing = searchParams.get("billing");
    const paymentId = searchParams.get("paymentId");
    if (billing !== "payapp-return" || !paymentId) return;

    let active = true;
    const checkPayment = async () => {
      setNotice("결제 결과를 확인하는 중입니다...");
      const response = await fetch(`/api/billing/payapp/status?paymentId=${encodeURIComponent(paymentId)}`, { cache: "no-store" });
      const payload = (await response.json()) as PayappStatusPayload;
      if (!active) return;

      if (!response.ok || !payload.payment) {
        setNotice(payload.error ?? "결제 상태를 확인하지 못했습니다.");
        return;
      }
      if (payload.payment.status === "paid") {
        setNotice(`${payload.payment.credits}크레딧이 충전되었습니다.`);
        await refreshMe();
        router.replace("/account");
        return;
      }
      if (payload.payment.status === "pending") {
        setNotice("결제 통보를 기다리는 중입니다. 잠시 후 새로고침하면 크레딧이 반영될 수 있습니다.");
        return;
      }
      setNotice("결제가 취소되었거나 실패했습니다.");
    };
    void checkPayment();
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  const chargeCredits = async () => {
    try {
      setIsCharging(true);
      setNotice(null);
      if (!me?.user) {
        router.push("/login?returnTo=/account");
        return;
      }
      const response = await fetch("/api/billing/payapp/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = (await response.json()) as PayappPreparePayload;
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "페이앱 결제 요청에 실패했습니다.");
      }
      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "결제에 실패했습니다.");
      setIsCharging(false);
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsSignOutConfirmOpen(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/account" />
      <div className="mx-auto grid max-w-5xl gap-5 px-5 py-8 md:px-8">
        <section className="grid gap-4 rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_18px_48px_rgba(42,103,103,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">계정</p>
              <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">{me?.user ? me.profile?.display_name || me.user.email : "로그인이 필요합니다"}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--color-on-surface-variant)]">{me?.user ? me.user.email : "크레딧 충전과 테마 내보내기를 사용하려면 로그인하세요."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {me?.user ? (
                <button type="button" className="rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-sm font-black text-[#334155]" onClick={() => setIsSignOutConfirmOpen(true)}>
                  로그아웃
                </button>
              ) : (
                <Link href="/login?returnTo=/account" className="rounded-full bg-[#0f172a] px-4 py-2 text-sm font-black text-white">
                  로그인
                </Link>
              )}
            </div>
          </div>

          {notice ? <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{notice}</p> : null}

          <div className="grid gap-3 md:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[#64748b]">크레딧</span>
              <strong className="mt-1 block text-4xl font-black text-[#0f172a]">{isLoading ? "..." : me?.credits ?? 0}</strong>
              <p className="mt-1 text-sm font-semibold text-[#64748b]">테마 내보내기에 성공하면 1크레딧이 차감됩니다.</p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <label className="grid gap-2">
                <span className="text-sm font-black text-[#0f172a]">휴대폰번호</span>
                <input
                  className="h-11 rounded-xl border border-[#d1d5db] px-3 text-sm font-semibold outline-none transition focus:border-[#2563eb]"
                  inputMode="tel"
                  placeholder="01012345678"
                  value={phone}
                  onChange={(event) => setPhone(event.currentTarget.value)}
                  disabled={isCharging}
                />
              </label>
              <button type="button" className="rounded-2xl bg-[#0f172a] px-6 py-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60" onClick={() => void chargeCredits()} disabled={isCharging || isLoading}>
                {isCharging ? "결제 준비 중..." : "10크레딧 충전 - ₩9,900"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-[28px] border border-[var(--color-outline-variant)] bg-white p-5">
          <h2 className="text-lg font-black text-[#0f172a]">최근 내보내기</h2>
          <div className="grid gap-2">
            {(me?.exports ?? []).length === 0 ? <p className="text-sm font-semibold text-[#64748b]">아직 내보내기 이력이 없습니다.</p> : null}
            {(me?.exports ?? []).map((item) => (
              <div key={item.id} className="grid gap-1 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 md:grid-cols-[1fr_auto]">
                <div>
                  <strong className="text-sm font-black text-[#0f172a]">
                    {getPlatformLabel(item.platform)} / {getExportModeLabel(item.export_mode)}
                  </strong>
                  <p className="text-xs font-semibold text-[#64748b]">{item.file_name ?? item.error ?? "파일 없음"}</p>
                </div>
                <span className="text-xs font-black text-[#475569]">{getExportStatusLabel(item.status)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isSignOutConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5">
          <section className="grid w-full max-w-sm gap-4 rounded-[24px] border border-[var(--color-outline-variant)] bg-white p-5 shadow-[0_24px_72px_rgba(15,23,42,0.24)]">
            <div>
              <h2 className="text-xl font-black text-[#0f172a]">로그아웃할까요?</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">현재 계정에서 로그아웃합니다. 저장된 크레딧과 내보내기 이력은 유지됩니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-black text-[#334155]" onClick={() => setIsSignOutConfirmOpen(false)}>
                취소
              </button>
              <button type="button" className="rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-black text-white" onClick={() => void signOut()}>
                로그아웃
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function getPlatformLabel(platform: string) {
  if (platform === "android") return "안드로이드";
  if (platform === "ios") return "iOS";
  return platform;
}

function getExportModeLabel(mode: string) {
  const labels: Record<string, string> = {
    project: "프로젝트",
    apk: "APK",
    "apk-zip": "APK ZIP",
    "theme-zip": "테마 ZIP",
    ktheme: "KTheme",
  };
  return labels[mode] ?? mode;
}

function getExportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "진행 중",
    succeeded: "완료",
    failed: "실패",
  };
  return labels[status] ?? status;
}
