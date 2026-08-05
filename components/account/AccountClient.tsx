"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Coins, Download, LoaderCircle, Megaphone, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Star, UserRound } from "lucide-react";
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
      <div className="relative mx-auto w-full max-w-7xl px-5 py-8 md:px-8 md:py-11">
        <Star className="pointer-events-none absolute left-[2%] top-10 hidden h-7 w-7 rotate-12 text-[#fee500] lg:block" />
        <Sparkles className="pointer-events-none absolute right-[8%] top-16 hidden h-7 w-7 text-[#fbbf24] lg:block" />

        {/* 이 페이지는 h2 세 개로만 시작해 최상위 제목이 없었다. 제목 탐색으로 화면을 파악할 수 있게 h1을 둔다. */}
        <header className="mb-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3d7bd6]">My Page</p>
          <h1 className="mt-2 font-[var(--font-display)] text-[30px] font-semibold tracking-[-0.04em] text-[var(--color-on-surface)] sm:text-[38px]">
            마이페이지
          </h1>
          <p className="mt-2 text-sm font-semibold leading-7 text-[var(--color-on-surface-variant)]">
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

        {/*
          1열로 접히면 DOM 순서대로 사용자 정보 → 보유 크레딧 → Export 이력이 된다.
          넓은 화면에서는 좌측 컬럼에 정보/이력, 우측 컬럼에 크레딧을 명시적으로 배치한다.
        */}
        <div className="grid content-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <section className="rounded-[28px] border border-[#dbe8fb] bg-white/86 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] backdrop-blur sm:p-6 lg:col-start-1 lg:row-start-1" aria-labelledby="account-info-title">
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

            <section className="rounded-[28px] border border-[#dbe8fb] bg-[#f7fbff] p-5 sm:p-6 lg:col-start-1 lg:row-start-2" aria-labelledby="storage-scope-title">
              <h2 id="storage-scope-title" className="text-base font-extrabold">보관 범위</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-[20px] border border-[#e3ecf7] bg-white p-4"><dt className="text-xs font-black text-[#3d7bd6]">계정에 보관</dt><dd className="mt-1 font-semibold leading-6 text-[var(--color-on-surface-variant)]">{persistenceNotice.accountDetailed}</dd></div>
                <div className="rounded-[20px] border border-[#e3ecf7] bg-white p-4"><dt className="text-xs font-black text-[#3d7bd6]">이 브라우저에 보관</dt><dd className="mt-1 font-semibold leading-6 text-[var(--color-on-surface-variant)]">{persistenceNotice.browserDetailed} {persistenceNotice.browserRisk}</dd></div>
              </dl>
            </section>

          <aside className="grid content-start gap-4 lg:col-start-2 lg:row-start-1">
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

            {me?.user ? (
              <section className="rounded-[28px] border border-[#dbe8fb] bg-white/86 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] backdrop-blur sm:p-6" aria-labelledby="support-entry-title">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6bbf]"><MessageSquare size={20} aria-hidden="true" /></span>
                  <div>
                    <h2 id="support-entry-title" className="text-base font-extrabold">공지·문의</h2>
                    <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">문의 답변은 이메일로 보내지 않습니다. 여기에서 확인해 주세요.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  <Link href="/account/inquiries" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#cfe0ff] bg-white px-4 py-3 text-sm font-extrabold text-[#2f6bbf] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
                    문의하기·답변 보기<ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <Link href="/notice" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#dbe8fb] bg-white px-4 py-3 text-sm font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]">
                    <Megaphone size={16} aria-hidden="true" />공지사항
                  </Link>
                </div>
              </section>
            ) : null}
          </aside>

            <section className="rounded-[28px] border border-[#dbe8fb] bg-white/86 p-5 shadow-[0_18px_48px_rgba(47,107,191,0.08)] backdrop-blur sm:p-6 lg:col-start-1 lg:row-start-3" aria-labelledby="export-history-title">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#eafaf1] text-[#34c98a]"><Download size={20} aria-hidden="true" /></span>
                <div><h2 id="export-history-title" className="text-base font-extrabold">최근 Export 이력</h2><p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">최근 10개의 내보내기 작업입니다. Android 결과 파일은 7일간 보관합니다.</p></div>
              </div>
              {(me?.exports ?? []).length === 0 ? <div className="rounded-[24px] bg-[#f7fbff] px-4 py-8 text-center text-sm font-semibold text-[var(--color-on-surface-variant)]">아직 내보내기 이력이 없습니다.</div> : (
                <div className="overflow-hidden rounded-[24px] border border-[#e3ecf7] bg-[#fcfdff] divide-y divide-[var(--color-outline-variant)]">
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
  return <div className="grid gap-2 bg-white/75 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><strong className="text-sm font-extrabold">{item.export_number ? `#${item.export_number} · ` : ""}{title}</strong>{item.status === "pending" && item.stage ? <span className="text-[11px] font-bold text-[var(--color-on-surface-variant)]">{getExportStageLabel(item.stage)}</span> : null}</div><p className="mt-1 truncate text-xs font-semibold text-[var(--color-on-surface-variant)]">{getPlatformLabel(item.platform)} · {getExportModeLabel(item.export_mode)}{item.file_name ? ` · ${item.file_name}` : ""}</p>{identifier ? <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-outline)]" title={identifier}>{identifier}</p> : null}<ExportRowAction item={item} onRefreshed={onRefreshed} /></div><div className="flex items-center justify-between gap-4 text-xs font-bold text-[var(--color-on-surface-variant)] sm:block sm:text-right"><span className="sm:block">{creditLabel}</span>{item.duration_ms != null ? <span className="sm:mt-1 sm:block">{formatDuration(item.duration_ms)}</span> : null}<time className="sm:mt-1 sm:block" dateTime={item.created_at}>{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</time></div></div>;
}

/**
 * 내보내기 결과를 다시 받거나, 멈춘 것처럼 보이는 작업의 상태를 확인한다.
 *
 * APK 빌드는 최대 12분 폴링인데 그동안 탭이 닫히면 크레딧만 차감된 채 결과를 받을 방법이 없었다.
 * 결과 파일은 보관 기간 동안 남아 있으므로 여기서 서명 URL을 새로 발급받는다.
 */
function ExportRowAction({ item, onRefreshed }: { item: AccountExportDto; onRefreshed: () => void }) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadState = getExportDownloadState({
    platform: item.platform,
    status: item.status,
    completedAt: item.completed_at,
    createdAt: item.created_at,
  });

  const download = async () => {
    if (isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/export/android/download?jobId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
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
      const response = await fetch(`/api/export/android/status?jobId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
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

  if (item.status === "pending" && item.platform === "android") {
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
function getExportModeLabel(mode: string) { return ({ project: "프로젝트", apk: "APK", "apk-zip": "APK ZIP", "theme-zip": "테마 ZIP", ktheme: "KTheme" } as Record<string, string>)[mode] ?? mode; }
function getExportStatusLabel(status: string) { return ({ pending: "진행 중", succeeded: "완료", failed: "실패" } as Record<string, string>)[status] ?? status; }
function getExportStageLabel(stage: string) { return ({ queued: "대기 중", preparing: "프로젝트 준비", building: "APK 빌드", packaging: "압축 중", finalizing: "결과 정리" } as Record<string, string>)[stage] ?? stage; }
function formatDuration(durationMs: number) { return durationMs >= 60_000 ? `${Math.floor(durationMs / 60_000)}분 ${Math.round((durationMs % 60_000) / 1000)}초` : `${Math.max(1, Math.round(durationMs / 1000))}초`; }
