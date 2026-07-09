"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Coins, Download, ShieldCheck, Sparkles, Star, UserRound } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import type { AccountExportDto, AccountMeResponse } from "@/lib/billing/apiTypes";
import { readJsonResponse } from "@/lib/shared/api/http";

export default function AccountClient() {
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

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

  const provider = me?.profile?.provider === "kakao" ? "카카오" : "이메일";

  return (
    <main className="min-h-screen overflow-x-clip bg-[linear-gradient(180deg,#e8f1ff_0%,#f4f9ff_18%,#ffffff_40%,#f7fbff_68%,#e9f2ff_100%)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/account" />
      <div className="relative mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-11">
        <Star className="pointer-events-none absolute left-[2%] top-10 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Sparkles className="pointer-events-none absolute right-[8%] top-16 hidden h-7 w-7 text-[#fbbf24] lg:block" />

        <header className="relative mb-7 overflow-hidden rounded-[32px] border border-[#dbe8fb] bg-white/82 px-6 py-7 shadow-[0_24px_70px_rgba(47,107,191,0.1)] backdrop-blur sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(91,155,255,0.18),transparent_58%)]" />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-[#f7fbff] px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">
            <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
            My Page
          </span>
          <h1 className="mt-4 max-w-2xl font-[var(--font-display)] text-[34px] font-semibold tracking-[-0.05em] text-[var(--color-on-surface)] sm:text-[44px]">
            계정, 크레딧, 최근 Export를
            <span className="block text-[#2f6bbf]">한 화면에서 확인하세요.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)] sm:text-[16px]">
            지금 로그인한 계정 정보와 보유 크레딧, 최근 작업 상태를 빠르게 점검할 수 있습니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-[var(--color-on-surface-variant)]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe8fb] bg-white px-3.5 py-2">
              <UserRound className="h-3.5 w-3.5 text-[#2f6bbf]" />
              로그인 정보 확인
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe8fb] bg-white px-3.5 py-2">
              <Coins className="h-3.5 w-3.5 text-[#f2b705]" />
              크레딧 잔액 확인
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe8fb] bg-white px-3.5 py-2">
              <Download className="h-3.5 w-3.5 text-[#34c98a]" />
              최근 Export 이력
            </span>
          </div>
        </header>

        {accountError ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-[22px] border border-[#f1b7b1] bg-[var(--color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">
            <span className="flex items-center gap-2"><AlertCircle size={17} aria-hidden="true" />{accountError}</span>
            <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void refreshMe()}>다시 시도</button>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="grid content-start gap-6">
            <section className="rounded-[28px] border border-[#dbe8fb] bg-white/86 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] backdrop-blur sm:p-6" aria-labelledby="account-info-title">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#eaf2ff] text-[var(--color-secondary)]"><UserRound size={20} aria-hidden="true" /></span>
                <div><h2 id="account-info-title" className="text-base font-extrabold">사용자 정보</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">현재 로그인한 계정입니다.</p></div>
              </div>
              {isLoading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--color-surface-low)]" aria-label="계정 정보 불러오는 중" /> : me?.user ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-[22px] border border-[#e3ecf7] bg-[#f7fbff] p-4"><dt className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#3d7bd6]">이름</dt><dd className="min-w-0 truncate text-[15px] font-extrabold">{me.profile?.display_name || "이름 미설정"}</dd></div>
                  <div className="rounded-[22px] border border-[#e3ecf7] bg-[#f7fbff] p-4"><dt className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#3d7bd6]">로그인 방식</dt><dd className="flex items-center gap-1.5 text-[15px] font-extrabold"><ShieldCheck size={16} className="text-[var(--color-secondary)]" aria-hidden="true" />{provider} 계정</dd></div>
                  <div className="rounded-[22px] border border-[#e3ecf7] bg-[#f7fbff] p-4 sm:col-span-2"><dt className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#3d7bd6]">이메일</dt><dd className="break-all text-[15px] font-extrabold">{me.user.email || me.profile?.email || "등록된 이메일 없음"}</dd></div>
                </dl>
              ) : (
                <div><p className="text-sm font-semibold text-[var(--color-on-surface-variant)]">로그인하면 계정 정보를 확인할 수 있습니다.</p><Link href="/login?returnTo=%2Faccount" className="mt-4 inline-flex rounded-full bg-[#2f6bbf] px-5 py-3 text-sm font-extrabold text-white shadow-[0_16px_30px_rgba(47,107,191,0.22)]">로그인</Link></div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#dbe8fb] bg-white/86 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] backdrop-blur sm:p-6" aria-labelledby="export-history-title">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#eafaf1] text-[#34c98a]"><Download size={20} aria-hidden="true" /></span>
                <div><h2 id="export-history-title" className="text-base font-extrabold">최근 Export 이력</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">최근 10개의 내보내기 작업입니다.</p></div>
              </div>
              {(me?.exports ?? []).length === 0 ? <div className="rounded-[24px] bg-[#f7fbff] px-4 py-8 text-center text-sm font-semibold text-[var(--color-on-surface-variant)]">아직 내보내기 이력이 없습니다.</div> : (
                <div className="overflow-hidden rounded-[24px] border border-[#e3ecf7] bg-[#fcfdff] divide-y divide-[var(--color-outline-variant)]">
                  {(me?.exports ?? []).map((item) => <ExportRow key={item.id} item={item} />)}
                </div>
              )}
            </section>
          </div>

          <aside className="grid content-start gap-4">
            <section className="overflow-hidden rounded-[30px] border border-[#dbe8fb] bg-white/88 shadow-[0_24px_68px_rgba(47,107,191,0.1)] backdrop-blur" aria-labelledby="credit-balance-title">
              <div className="bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)] p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-on-surface-variant)]"><Coins size={18} aria-hidden="true" /><h2 id="credit-balance-title">보유 크레딧</h2></div>
                <div className="mt-3 flex items-end gap-2"><strong className="font-[var(--font-display)] text-5xl font-semibold tracking-[-0.05em] text-[#2f6bbf]">{isLoading ? "—" : me?.credits ?? 0}</strong><span className="pb-1.5 text-sm font-bold text-[var(--color-on-surface-variant)]">크레딧</span></div>
                <p className="mt-3 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">테마를 내보낼 때마다 1크레딧이 사용됩니다.</p>
              </div>
              <div className="p-5">
                <Link href={me?.user ? "/credits" : "/login?returnTo=%2Fcredits&reason=billing"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#fee500] px-4 py-3 text-sm font-extrabold text-[#191600] shadow-[0_16px_32px_rgba(254,229,0,0.34)] transition hover:-translate-y-0.5 hover:bg-[#ffe93a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
                  충전하기<ArrowRight size={17} aria-hidden="true" />
                </Link>
                <p className="mt-3 text-center text-[11px] font-semibold text-[var(--color-outline)]">필요한 만큼 상품을 선택해 충전할 수 있습니다.</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ExportRow({ item }: { item: AccountExportDto }) {
  const creditLabel = item.status === "failed" ? "차감 없음" : `${item.credit_cost}크레딧`;
  const title = item.export_name || item.file_name || "이름 없는 테마";
  const identifier = item.application_id ?? item.theme_identifier;
  return <div className="grid gap-2 bg-white/75 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><strong className="text-sm font-extrabold">{item.export_number ? `#${item.export_number} · ` : ""}{title}</strong>{item.status === "pending" && item.stage ? <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">{getExportStageLabel(item.stage)}</span> : null}</div><p className="mt-1 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{getPlatformLabel(item.platform)} · {getExportModeLabel(item.export_mode)}{item.file_name ? ` · ${item.file_name}` : ""}</p>{identifier ? <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-outline)]" title={identifier}>{identifier}</p> : null}</div><div className="flex items-center justify-between gap-4 text-xs font-bold text-[var(--color-on-surface-variant)] sm:block sm:text-right"><span className="sm:block">{creditLabel}</span>{item.duration_ms != null ? <span className="sm:mt-1 sm:block">{formatDuration(item.duration_ms)}</span> : null}<time className="sm:mt-1 sm:block" dateTime={item.created_at}>{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</time></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const label = getExportStatusLabel(status);
  const className = status === "succeeded" ? "bg-[#e4f6ee] text-[#155d45]" : status === "failed" ? "bg-[var(--color-error-container)] text-[var(--color-on-error-container)]" : "bg-[#fff2bd] text-[#665300]";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${className}`}>{label}</span>;
}

function getPlatformLabel(platform: string) { return platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform; }
function getExportModeLabel(mode: string) { return ({ project: "프로젝트", apk: "APK", "apk-zip": "APK ZIP", "theme-zip": "테마 ZIP", ktheme: "KTheme" } as Record<string, string>)[mode] ?? mode; }
function getExportStatusLabel(status: string) { return ({ pending: "진행 중", succeeded: "완료", failed: "실패" } as Record<string, string>)[status] ?? status; }
function getExportStageLabel(stage: string) { return ({ queued: "대기 중", preparing: "프로젝트 준비", building: "APK 빌드", packaging: "압축 중", finalizing: "결과 정리" } as Record<string, string>)[stage] ?? stage; }
function formatDuration(durationMs: number) { return durationMs >= 60_000 ? `${Math.floor(durationMs / 60_000)}분 ${Math.round((durationMs % 60_000) / 1000)}초` : `${Math.max(1, Math.round(durationMs / 1000))}초`; }
