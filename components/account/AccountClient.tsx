"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, ChevronDown, Coins, Download, LoaderCircle, Megaphone, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Star, UserRound } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import type { AccountExportDto, AccountMeResponse, ExportDownloadLinkResponse } from "@/lib/billing/apiTypes";
import { getExportDownloadState } from "@/lib/theme/android/outputRetention";
import { readJsonResponse } from "@/lib/shared/api/http";
import { createClient } from "@/lib/supabase/client";
import { persistenceNotice } from "@/lib/theme/project/persistenceNotice";
import { deleteLocalUserThemeData } from "@/lib/theme/project/deleteLocalUserData";

export default function AccountClient() {
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isDeletionOpen, setIsDeletionOpen] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshMe = useCallback(async () => {
    setAccountError(null);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = await readJsonResponse<AccountMeResponse>(response);
      if (!response.ok) throw new Error(payload.error);
      setMe(payload);
    } catch {
      setAccountError("계정 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const accountId = me?.user?.id ?? null;
  const pendingExportKey = (me?.exports ?? [])
    .filter((item) => (item.platform === "android" || item.platform === "ios") && item.status === "pending")
    .map((item) => `${item.id}:${item.platform}`)
    .join("|");

  useEffect(() => {
    if (!accountId || !pendingExportKey) return;
    let isChecking = false;
    const checkPendingExports = async () => {
      if (isChecking || document.visibilityState !== "visible") return;
      isChecking = true;
      try {
        const pendingJobs = pendingExportKey.split("|").map((value) => {
          const [id, platform] = value.split(":");
          return { id, platform: platform === "ios" ? "ios" : "android" } as const;
        });
        await Promise.all(pendingJobs.map(({ id, platform }) => fetch(`/api/export/${platform}/status?jobId=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => undefined)));
        await refreshMe();
      } finally {
        isChecking = false;
      }
    };
    void checkPendingExports();
    const interval = window.setInterval(() => { void checkPendingExports(); }, 10_000);
    const handleVisibilityChange = () => { if (document.visibilityState === "visible") void checkPendingExports(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accountId, pendingExportKey, refreshMe]);

  const deleteAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDeleting) return;
    if (deletionConfirmation !== "탈퇴") {
      setDeletionError("확인 문구로 '탈퇴'를 정확히 입력해 주세요.");
      return;
    }

    setIsDeleting(true);
    setDeletionError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deletionConfirmation }),
      });
      const payload = await readJsonResponse<{ deleted?: boolean; error?: string }>(response);
      if (!response.ok || !payload.deleted) throw new Error(payload.error);
      await deleteLocalUserThemeData().catch((error) => {
        console.error("Failed to clear local user theme data after account deletion", error);
      });
      await createClient().auth.signOut().catch(() => undefined);
      window.location.assign("/login?accountDeleted=1");
    } catch (error) {
      setDeletionError(error instanceof Error && error.message ? error.message : "회원탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setIsDeleting(false);
    }
  };

  const provider = me?.profile?.provider === "kakao" ? "카카오" : "이메일";

  return (
    <main className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_18%,#ffffff_40%,#f7fbff_68%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/account" />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-8 md:px-8 md:py-11">
        <Star className="pointer-events-none absolute left-[2%] top-10 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Sparkles className="pointer-events-none absolute right-[8%] top-16 hidden h-7 w-7 text-[#fbbf24] lg:block" />

        {/* 이 페이지는 h2 세 개로만 시작해 최상위 제목이 없었다. 제목 탐색으로 화면을 파악할 수 있게 h1을 둔다. */}
        <header className="mb-4 sm:mb-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">My Page</p>
          <h1 className="mt-1.5 font-[var(--font-display)] text-[28px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)] sm:mt-2 sm:text-[38px]">
            마이페이지
          </h1>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-[var(--color-on-surface-variant)] sm:hidden">
            계정·크레딧·내보내기를 한곳에서 관리합니다.
          </p>
          <p className="mt-2 hidden text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:block">
            계정 정보와 보유 크레딧, 최근 내보내기 이력을 한곳에서 확인합니다. 편집 프로젝트는 계정이 아니라 현재 브라우저에 저장됩니다.
          </p>
          {isLoading ? <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#3d7bd6]" role="status"><LoaderCircle className="animate-spin" size={15} aria-hidden="true" />계정 정보를 불러오는 중입니다.</p> : null}
        </header>

        {accountError ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-[22px] border border-[#f1b7b1] bg-[var(--color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">
            <span className="flex items-center gap-2"><AlertCircle size={17} aria-hidden="true" />{accountError}</span>
            <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void refreshMe()}>다시 시도</button>
          </div>
        ) : null}

        {/* 모바일에서는 계정과 크레딧을 하나의 요약 카드로 묶고, 데스크톱에서는 기존 2열로 펼친다. */}
        <div className="grid content-start gap-3 sm:gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="grid overflow-hidden rounded-[24px] border border-[#dbe8fb] bg-white/90 shadow-[0_14px_38px_rgba(47,107,191,0.08)] backdrop-blur lg:contents">
            <section className="p-4 sm:p-6 lg:col-start-1 lg:row-start-1 lg:rounded-[28px] lg:border lg:border-[#dbe8fb] lg:bg-white/86 lg:shadow-[0_18px_48px_rgba(47,107,191,0.08)]" aria-labelledby="account-info-title">
              <div className="mb-3 flex items-center gap-3 sm:mb-5">
                <span className="grid size-10 place-items-center rounded-[14px] bg-[#eaf2ff] text-[var(--color-secondary)] sm:size-11 sm:rounded-2xl"><UserRound size={20} aria-hidden="true" /></span>
                <div><h2 id="account-info-title" className="text-base font-extrabold">사용자 정보</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">현재 로그인한 계정입니다.</p></div>
              </div>
              {isLoading ? <div className="h-16 animate-pulse rounded-xl bg-[var(--color-surface-low)] sm:h-20" aria-label="계정 정보 불러오는 중" /> : me?.user ? (
                <dl className="grid grid-cols-2 gap-2 text-sm sm:gap-3">
                  <div className="min-w-0 rounded-2xl border border-[#e3ecf7] bg-[#f7fbff] p-3 sm:rounded-[22px] sm:p-4"><dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#3d7bd6] sm:text-xs">이름</dt><dd className="truncate text-sm font-extrabold sm:text-[15px]">{me.profile?.display_name || "이름 미설정"}</dd></div>
                  <div className="min-w-0 rounded-2xl border border-[#e3ecf7] bg-[#f7fbff] p-3 sm:rounded-[22px] sm:p-4"><dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#3d7bd6] sm:text-xs">로그인 방식</dt><dd className="flex items-center gap-1.5 truncate text-sm font-extrabold sm:text-[15px]"><ShieldCheck size={15} className="shrink-0 text-[var(--color-secondary)]" aria-hidden="true" />{provider} 계정</dd></div>
                  <div className="col-span-2 min-w-0 rounded-2xl border border-[#e3ecf7] bg-[#f7fbff] p-3 sm:rounded-[22px] sm:p-4"><dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#3d7bd6] sm:text-xs">이메일</dt><dd className="truncate text-sm font-extrabold sm:text-[15px]" title={me.user.email || me.profile?.email || undefined}>{me.user.email || me.profile?.email || "등록된 이메일 없음"}</dd></div>
                </dl>
              ) : (
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold leading-5 text-[var(--color-on-surface-variant)]">로그인하고 계정과 내보내기 이력을 확인하세요.</p><Link href="/login?returnTo=%2Faccount" className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#2f6bbf] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_12px_24px_rgba(47,107,191,0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">로그인</Link></div>
              )}
            </section>

            <section className="border-t border-[#e3ecf7] bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)] lg:col-start-2 lg:row-start-1 lg:overflow-hidden lg:rounded-[30px] lg:border lg:border-[#dbe8fb] lg:bg-white/88 lg:shadow-[0_24px_68px_rgba(47,107,191,0.1)]" aria-labelledby="credit-balance-title">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 sm:p-6 lg:block lg:bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)]">
                <div>
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-on-surface-variant)]"><Coins size={18} aria-hidden="true" /><h2 id="credit-balance-title">보유 크레딧</h2></div>
                  <div className="mt-1.5 flex items-end gap-2 sm:mt-3"><strong className="font-[var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-[#2f6bbf] sm:text-5xl">{isLoading ? "—" : me?.credits ?? 0}</strong><span className="pb-1 text-sm font-bold text-[var(--color-on-surface-variant)] sm:pb-1.5">크레딧</span></div>
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-[var(--color-on-surface-variant)] sm:mt-3 sm:text-xs">내보내기 1회당 1크레딧을 사용합니다.</p>
                </div>
                <Link href={me?.user ? "/credits" : "/login?returnTo=%2Fcredits&reason=billing"} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#fee500] px-4 py-2.5 text-sm font-extrabold text-[#191600] shadow-[0_12px_24px_rgba(254,229,0,0.3)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] lg:hidden">
                  충전<ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className="hidden p-5 lg:block">
                <Link href={me?.user ? "/credits" : "/login?returnTo=%2Fcredits&reason=billing"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#fee500] px-4 py-3 text-sm font-extrabold text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
                  충전하기<ArrowRight size={17} aria-hidden="true" />
                </Link>
                <p className="mt-3 text-center text-[11px] font-semibold text-[var(--color-outline)]">필요한 만큼 상품을 선택해 충전할 수 있습니다.</p>
              </div>
            </section>
          </div>

          <section className="rounded-[22px] border border-[#dbe8fb] bg-[#f7fbff] p-4 sm:rounded-[28px] sm:p-6 lg:col-start-1 lg:row-start-2" aria-labelledby="storage-scope-title">
            <h2 id="storage-scope-title" className="text-sm font-extrabold sm:text-base">보관 범위</h2>
            <details className="group mt-2 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5 text-sm font-bold text-[var(--color-on-surface-variant)] [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2"><AlertCircle size={17} className="shrink-0 text-[#3d7bd6]" aria-hidden="true" /><span>프로젝트는 이 브라우저에만 저장됩니다.</span></span>
                <ChevronDown size={17} className="shrink-0 text-[#3d7bd6] transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <dl className="mt-2 grid gap-2 text-xs">
                <div className="rounded-2xl border border-[#e3ecf7] bg-white p-3"><dt className="font-black text-[#3d7bd6]">계정에 보관</dt><dd className="mt-1 font-semibold leading-5 text-[var(--color-on-surface-variant)]">{persistenceNotice.accountDetailed}</dd></div>
                <div className="rounded-2xl border border-[#e3ecf7] bg-white p-3"><dt className="font-black text-[#3d7bd6]">이 브라우저에 보관</dt><dd className="mt-1 font-semibold leading-5 text-[var(--color-on-surface-variant)]">{persistenceNotice.browserDetailed} {persistenceNotice.browserRisk}</dd></div>
              </dl>
            </details>
            <dl className="mt-4 hidden gap-3 text-sm lg:grid lg:grid-cols-2">
              <div className="rounded-[20px] border border-[#e3ecf7] bg-white p-4"><dt className="text-xs font-black text-[#3d7bd6]">계정에 보관</dt><dd className="mt-1 font-semibold leading-6 text-[var(--color-on-surface-variant)]">{persistenceNotice.accountDetailed}</dd></div>
              <div className="rounded-[20px] border border-[#e3ecf7] bg-white p-4"><dt className="text-xs font-black text-[#3d7bd6]">이 브라우저에 보관</dt><dd className="mt-1 font-semibold leading-6 text-[var(--color-on-surface-variant)]">{persistenceNotice.browserDetailed} {persistenceNotice.browserRisk}</dd></div>
            </dl>
          </section>

          {me?.user ? (
            <section className="rounded-[22px] border border-[#dbe8fb] bg-white/86 p-4 shadow-[0_14px_38px_rgba(47,107,191,0.07)] backdrop-blur sm:rounded-[28px] sm:p-6 lg:col-start-2 lg:row-start-2" aria-labelledby="support-entry-title">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-[14px] bg-[#eef5ff] text-[#2f6bbf] sm:size-11 sm:rounded-2xl"><MessageSquare size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="support-entry-title" className="text-base font-extrabold">공지·문의</h2>
                  <p className="text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)] sm:text-xs">문의 답변은 이 페이지에서 확인할 수 있습니다.</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
                <Link href="/account/inquiries" className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#cfe0ff] bg-white px-3 py-2.5 text-sm font-extrabold text-[#2f6bbf] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] lg:min-h-12">
                  문의·답변<ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/notice" className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#dbe8fb] bg-white px-3 py-2.5 text-sm font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] lg:min-h-12">
                  <Megaphone size={16} aria-hidden="true" />공지사항
                </Link>
              </div>
            </section>
          ) : null}

          <section className="rounded-[22px] border border-[#dbe8fb] bg-white/86 p-4 shadow-[0_14px_38px_rgba(47,107,191,0.07)] backdrop-blur sm:rounded-[28px] sm:p-6 lg:col-start-1 lg:row-start-3" aria-labelledby="export-history-title">
            <div className="mb-3 flex items-center gap-3 sm:mb-5">
              <span className="grid size-10 place-items-center rounded-[14px] bg-[#eafaf1] text-[#34c98a] sm:size-11 sm:rounded-2xl"><Download size={20} aria-hidden="true" /></span>
              <div><h2 id="export-history-title" className="text-base font-extrabold">최근 내보내기</h2><p className="text-[11px] font-semibold leading-4 text-[var(--color-on-surface-variant)] sm:text-xs">최근 10개 · 완료된 Android와 비동기 iOS 결과는 최대 7일간 다시 받을 수 있습니다.</p></div>
            </div>
            {pendingExportKey ? <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[#cfe0ff] bg-[#f4f9ff] px-3.5 py-3 text-[11px] font-semibold leading-5 text-[#36577f]" role="status" aria-live="polite"><RefreshCw className="mt-0.5 shrink-0 text-[#2f6bbf]" size={15} aria-hidden="true" /><span><strong className="font-extrabold text-[#2f6bbf]">백그라운드에서 생성 중입니다.</strong> 이 페이지는 10초마다 상태를 확인하며, 창을 닫아도 작업은 계속됩니다.</span></div> : null}
            {(me?.exports ?? []).length === 0 ? <div className="rounded-[18px] bg-[#f7fbff] px-4 py-5 text-center text-sm font-semibold text-[var(--color-on-surface-variant)] sm:rounded-[24px] sm:py-8">아직 내보내기 이력이 없습니다.</div> : (
              <div className="divide-y divide-[var(--color-outline-variant)] overflow-hidden rounded-[18px] border border-[#e3ecf7] bg-[#fcfdff] sm:rounded-[24px]">
                {(me?.exports ?? []).map((item) => <ExportRow key={item.id} item={item} onRefreshed={() => void refreshMe()} />)}
              </div>
            )}
          </section>

            {me?.user ? (
              <section className="border-t border-[#e3ecf7] pt-5 text-right lg:col-start-1 lg:row-start-4" aria-labelledby="account-deletion-title">
                {!isDeletionOpen ? (
                  <p className="text-xs font-semibold text-[var(--color-outline)]"><span id="account-deletion-title">계정을 더 이상 사용하지 않으시나요?</span> <button type="button" className="ml-1 font-bold text-[var(--color-on-surface-variant)] underline underline-offset-2 transition hover:text-[var(--color-error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-error)]" onClick={() => { setIsDeletionOpen(true); setDeletionError(null); }}>회원탈퇴</button></p>
                ) : (
                  <form className="ml-auto grid max-w-md gap-2 rounded-2xl border border-[#f3d4d0] bg-[#fffaf9] p-3 text-left" onSubmit={deleteAccount} noValidate>
                    <p id="account-deletion-title" className="text-xs font-bold leading-5 text-[var(--color-on-surface-variant)]">
                      계정 정보·업로드 이미지·브라우저 프로젝트·내보내기 이력과 남은 크레딧은 모두 삭제되며 복구할 수 없습니다. 관계 법령에 따라 결제·환불 기록과 문의 내역의 최소 항목은 일반 회원정보와 분리해 일정 기간 보관합니다. 계속하려면 <strong className="text-[var(--color-error)]">탈퇴</strong>를 입력해 주세요.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--color-outline-variant)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--color-error)] focus:ring-2 focus:ring-[var(--color-error-container)]" value={deletionConfirmation} onChange={(event) => setDeletionConfirmation(event.currentTarget.value)} autoComplete="off" disabled={isDeleting} aria-label="회원탈퇴 확인 문구" />
                      <button type="submit" className="h-9 rounded-full bg-[var(--color-error)] px-3.5 text-xs font-extrabold text-white disabled:opacity-50" disabled={isDeleting}>{isDeleting ? "처리 중" : "탈퇴"}</button>
                    </div>
                    {deletionError ? <p className="rounded-xl bg-[var(--color-error-container)] px-3.5 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">{deletionError}</p> : null}
                    <button type="button" className="justify-self-end text-xs font-bold text-[var(--color-on-surface-variant)] underline underline-offset-2" onClick={() => { setIsDeletionOpen(false); setDeletionConfirmation(""); setDeletionError(null); }} disabled={isDeleting}>취소</button>
                  </form>
                )}
              </section>
            ) : null}
        </div>
      </div>
    </main>
  );
}

function ExportRow({ item, onRefreshed }: { item: AccountExportDto; onRefreshed: () => void }) {
  const creditLabel = item.status === "failed" ? "차감 없음" : `${item.credit_cost}크레딧`;
  const title = item.export_name || item.file_name || "이름 없는 테마";
  const identifier = item.application_id ?? item.theme_identifier;
  return <div className="grid gap-2 bg-white/75 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><strong className="text-sm font-extrabold">{item.export_number ? `#${item.export_number} · ` : ""}{title}</strong>{item.status === "pending" && item.stage ? <span className="rounded-full bg-[#eff6ff] px-2 py-1 text-[11px] font-bold text-[#2f6bbf]">{getExportStageLabel(item.stage, item.platform)}</span> : null}</div><p className="mt-1 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{getPlatformLabel(item.platform)} · {getExportModeLabel(item.export_mode)}{item.file_name ? ` · ${item.file_name}` : ""}</p>{identifier ? <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-outline)]" title={identifier}>{identifier}</p> : null}<ExportRowAction item={item} onRefreshed={onRefreshed} /></div><div className="flex items-center justify-between gap-4 text-xs font-bold text-[var(--color-on-surface-variant)] sm:block sm:text-right"><span className="sm:block">{creditLabel}</span>{item.duration_ms != null ? <span className="sm:mt-1 sm:block">{formatDuration(item.duration_ms)}</span> : null}<time className="sm:mt-1 sm:block" dateTime={item.created_at}>{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</time></div></div>;
}

/**
 * 내보내기 결과를 다시 받거나, 멈춘 것처럼 보이는 작업의 상태를 확인한다.
 *
 * 비동기 빌드는 최대 12분 폴링인데 그동안 탭이 닫히면 크레딧만 차감된 채 결과를 받을 방법이 없었다.
 * 결과 파일은 보관 기간 동안 남아 있으므로 여기서 서명 URL을 새로 발급받는다.
 */
function ExportRowAction({ item, onRefreshed }: { item: AccountExportDto; onRefreshed: () => void }) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadState = getExportDownloadState({
    platform: item.platform,
    backend: item.export_backend,
    status: item.status,
    completedAt: item.completed_at,
    createdAt: item.created_at,
  });

  const download = async () => {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/export/${getExportApiPlatform(item.platform)}/download?jobId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const payload = await readJsonResponse<ExportDownloadLinkResponse>(response);
      if (!response.ok || !payload.downloadUrl) {
        setError(payload.error ?? "다운로드 링크를 발급하지 못했습니다.");
        // 만료처럼 상태가 실제로 바뀐 경우 목록을 새로 읽어 표시를 맞춘다.
        if (payload.reason === "expired") onRefreshed();
        return;
      }
      window.location.href = payload.downloadUrl;
    } catch {
      setError("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsWorking(false);
    }
  };

  const refreshStatus = async () => {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      // status 엔드포인트는 조회하면서 멈춘 작업을 정산한다. 오래 진행 중인 작업의 크레딧이 여기서 반환된다.
      const response = await fetch(`/api/export/${getExportApiPlatform(item.platform)}/status?jobId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!response.ok) {
        setError("상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onRefreshed();
    } catch {
      setError("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsWorking(false);
    }
  };

  if (item.status === "pending" && (item.platform === "android" || item.platform === "ios")) {
    return (
      <div className="mt-2">
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#cfe0ff] bg-white px-3 text-xs font-extrabold text-[#2f6bbf] transition hover:bg-[#f4f9ff] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]" onClick={() => void refreshStatus()} disabled={isWorking}>
          <RefreshCw size={14} className={isWorking ? "animate-spin" : undefined} aria-hidden="true" />
          {isWorking ? "확인 중" : "상태 확인"}
        </button>
        {error ? <p className="mt-1.5 text-[11px] font-bold text-[var(--color-error)]" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (downloadState === "available") {
    return (
      <div className="mt-2">
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#2f6bbf] px-3.5 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(47,107,191,0.22)] transition hover:bg-[#2a60ac] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]" onClick={() => void download()} disabled={isWorking}>
          <Download size={14} aria-hidden="true" />
          {isWorking ? "준비 중" : "다시 받기"}
        </button>
        {error ? <p className="mt-1.5 text-[11px] font-bold text-[var(--color-error)]" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (downloadState === "expired") {
    return <p className="mt-2 text-[11px] font-bold text-[var(--color-outline)]">보관 기간이 지나 결과 파일이 삭제됐습니다. 편집 화면에서 다시 내보내 주세요.</p>;
  }

  if (downloadState === "unsupported") {
    return <p className="mt-2 text-[11px] font-bold text-[var(--color-outline)]">iOS 결과 파일은 서버에 보관하지 않습니다. 내려받은 파일을 기기에 보관해 주세요.</p>;
  }

  return null;
}

function StatusBadge({ status }: { status: string }) {
  const label = getExportStatusLabel(status);
  const className = status === "succeeded" ? "bg-[#e4f6ee] text-[#155d45]" : status === "failed" ? "bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "bg-[#fff2bd] text-[#665300]";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${className}`}>{label}</span>;
}

function getPlatformLabel(platform: string) { return platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform; }
function getExportApiPlatform(platform: string) { return platform === "ios" ? "ios" : "android"; }
function getExportModeLabel(mode: string) { return ({ project: "프로젝트", apk: "APK", "apk-zip": "APK ZIP", "theme-zip": "테마 ZIP", ktheme: "KTheme" } as Record<string, string>)[mode] ?? mode; }
function getExportStatusLabel(status: string) { return ({ pending: "처리 중", succeeded: "완료", failed: "실패" } as Record<string, string>)[status] ?? status; }
function getExportStageLabel(stage: string, platform: string) {
  if (stage === "building") return platform === "ios" ? "iOS 파일 생성" : "APK 빌드";
  if (stage === "packaging") return platform === "ios" ? "KTheme 압축" : "APK 압축";
  return ({ queued: "대기 중", preparing: "리소스 준비", finalizing: "결과 정리" } as Record<string, string>)[stage] ?? stage;
}
function formatDuration(durationMs: number) { return durationMs >= 60_000 ? `${Math.floor(durationMs / 60_000)}분 ${Math.round((durationMs % 60_000) / 1000)}초` : `${Math.max(1, Math.round(durationMs / 1000))}초`; }
