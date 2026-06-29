"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Coins, Download, ShieldCheck, UserRound } from "lucide-react";
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
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-on-background)]">
      <SiteHeader currentPath="/account" />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-11">
        <header className="mb-7 border-b border-[var(--color-outline-variant)] pb-6">
          <p className="text-xs font-extrabold tracking-[0.14em] text-[var(--color-secondary)]">MY PAGE</p>
          <h1 className="mt-2 font-[var(--font-display)] text-[32px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)]">마이페이지</h1>
          <p className="mt-2 text-sm font-medium text-[var(--color-on-surface-variant)]">계정 정보와 크레딧, 최근 Export 기록을 확인합니다.</p>
        </header>

        {accountError ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#f1b7b1] bg-[var(--color-error-container)] px-4 py-3 text-sm font-semibold text-[var(--color-on-error-container)]" role="alert">
            <span className="flex items-center gap-2"><AlertCircle size={17} aria-hidden="true" />{accountError}</span>
            <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => void refreshMe()}>다시 시도</button>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="grid content-start gap-6">
            <section className="rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 sm:p-6" aria-labelledby="account-info-title">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--color-surface-low)] text-[var(--color-secondary)]"><UserRound size={20} aria-hidden="true" /></span>
                <div><h2 id="account-info-title" className="text-base font-extrabold">사용자 정보</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">현재 로그인한 계정입니다.</p></div>
              </div>
              {isLoading ? <div className="h-20 animate-pulse rounded-xl bg-[var(--color-surface-low)]" aria-label="계정 정보 불러오는 중" /> : me?.user ? (
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <div><dt className="mb-1 text-xs font-bold text-[var(--color-on-surface-variant)]">이름</dt><dd className="min-w-0 truncate font-extrabold">{me.profile?.display_name || "이름 미설정"}</dd></div>
                  <div><dt className="mb-1 text-xs font-bold text-[var(--color-on-surface-variant)]">로그인 방식</dt><dd className="flex items-center gap-1.5 font-extrabold"><ShieldCheck size={16} className="text-[var(--color-secondary)]" aria-hidden="true" />{provider} 계정</dd></div>
                  <div className="sm:col-span-2"><dt className="mb-1 text-xs font-bold text-[var(--color-on-surface-variant)]">이메일</dt><dd className="break-all font-extrabold">{me.user.email || me.profile?.email || "등록된 이메일 없음"}</dd></div>
                </dl>
              ) : (
                <div><p className="text-sm font-semibold text-[var(--color-on-surface-variant)]">로그인하면 계정 정보를 확인할 수 있습니다.</p><Link href="/login?returnTo=%2Faccount" className="mt-4 inline-flex rounded-xl bg-[var(--color-inverse-surface)] px-4 py-2.5 text-sm font-extrabold text-[var(--color-inverse-on-surface)]">로그인</Link></div>
              )}
            </section>

            <section className="rounded-[20px] border border-[var(--color-outline-variant)] bg-white p-5 sm:p-6" aria-labelledby="export-history-title">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--color-surface-low)] text-[var(--color-secondary)]"><Download size={20} aria-hidden="true" /></span>
                <div><h2 id="export-history-title" className="text-base font-extrabold">최근 Export 이력</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">최근 10개의 내보내기 작업입니다.</p></div>
              </div>
              {(me?.exports ?? []).length === 0 ? <div className="rounded-xl bg-[var(--color-surface-low)] px-4 py-8 text-center text-sm font-semibold text-[var(--color-on-surface-variant)]">아직 내보내기 이력이 없습니다.</div> : (
                <div className="divide-y divide-[var(--color-outline-variant)] border-y border-[var(--color-outline-variant)]">
                  {(me?.exports ?? []).map((item) => <ExportRow key={item.id} item={item} />)}
                </div>
              )}
            </section>
          </div>

          <aside className="grid content-start gap-4">
            <section className="overflow-hidden rounded-[20px] border border-[var(--color-outline-variant)] bg-white" aria-labelledby="credit-balance-title">
              <div className="bg-[var(--color-surface-low)] p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-on-surface-variant)]"><Coins size={18} aria-hidden="true" /><h2 id="credit-balance-title">보유 크레딧</h2></div>
                <div className="mt-3 flex items-end gap-2"><strong className="font-[var(--font-display)] text-5xl font-semibold tracking-[-0.05em]">{isLoading ? "—" : me?.credits ?? 0}</strong><span className="pb-1.5 text-sm font-bold text-[var(--color-on-surface-variant)]">크레딧</span></div>
                <p className="mt-3 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">테마를 내보낼 때마다 1크레딧이 사용됩니다.</p>
              </div>
              <div className="p-5">
                <Link href={me?.user ? "/credits" : "/login?returnTo=%2Fcredits&reason=billing"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-inverse-surface)] px-4 py-3 text-sm font-extrabold text-[var(--color-inverse-on-surface)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
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
  return <div className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><strong className="text-sm font-extrabold">{item.export_number ? `#${item.export_number} · ` : ""}{title}</strong>{item.status === "pending" && item.stage ? <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">{getExportStageLabel(item.stage)}</span> : null}</div><p className="mt-1 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{getPlatformLabel(item.platform)} · {getExportModeLabel(item.export_mode)}{item.file_name ? ` · ${item.file_name}` : ""}</p>{identifier ? <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-outline)]" title={identifier}>{identifier}</p> : null}</div><div className="flex items-center justify-between gap-4 text-xs font-bold text-[var(--color-on-surface-variant)] sm:block sm:text-right"><span className="sm:block">{creditLabel}</span>{item.duration_ms != null ? <span className="sm:mt-1 sm:block">{formatDuration(item.duration_ms)}</span> : null}<time className="sm:mt-1 sm:block" dateTime={item.created_at}>{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</time></div></div>;
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
