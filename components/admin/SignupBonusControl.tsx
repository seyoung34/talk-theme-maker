"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Gift, LoaderCircle, PauseCircle, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { SignupBonusCampaignDto } from "@/lib/billing/apiTypes";

type CampaignResponse = { campaign?: SignupBonusCampaignDto; error?: string };

export default function SignupBonusControl() {
  const [campaign, setCampaign] = useState<SignupBonusCampaignDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/signup-bonus", { cache: "no-store" });
      const payload = (await response.json()) as CampaignResponse;
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "가입 혜택 캠페인을 불러오지 못했습니다.");
      setCampaign(payload.campaign);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "가입 혜택 캠페인을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  const toggleStatus = async () => {
    if (!campaign || isUpdating) return;
    const nextStatus = campaign.status === "active" ? "inactive" : "active";
    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/signup-bonus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as CampaignResponse;
      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "가입 혜택 상태를 변경하지 못했습니다.");
      setCampaign(payload.campaign);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "가입 혜택 상태를 변경하지 못했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section className="rounded-[20px] border border-[#f2df86] bg-[#fffdf0] p-5 shadow-[0_12px_30px_rgba(242,183,5,0.08)] sm:p-6" aria-labelledby="signup-bonus-control-title" data-testid="signup-bonus-control">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fee500] text-[#695600]"><Gift size={19} aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8a7c3b]">Signup bonus</p>
            <h2 id="signup-bonus-control-title" className="mt-1 text-lg font-extrabold text-[#4d4100]">신규 가입 첫 테마 혜택</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#746a3a]">이메일 인증 또는 카카오 가입을 마친 신규 계정에 지급합니다.</p>
          </div>
        </div>
        <button type="button" className="grid size-10 place-items-center rounded-xl border border-[#e7d989] bg-white text-[#695600] disabled:opacity-55" onClick={() => void loadCampaign()} disabled={isLoading || isUpdating} aria-label="가입 혜택 새로고침">
          <RefreshCw size={17} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </div>

      {error ? <p className="mt-4 flex gap-1.5 rounded-xl bg-[var(--color-error-container)] px-3 py-2.5 text-xs font-bold leading-5 text-[var(--color-on-error-container)]" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />{error}</p> : null}

      {isLoading ? <div className="mt-5 h-24 animate-pulse rounded-2xl bg-white/70" aria-label="가입 혜택 확인 중" role="status" /> : campaign ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${campaign.status === "active" ? "bg-[#e4f6ee] text-[#155d45]" : "bg-[#edf0f4] text-[#5c6878]"}`}>
                {campaign.status === "active" ? "지급 중" : "중지됨"}
              </span>
              <strong className="text-sm font-extrabold text-[#4d4100]">가입 혜택 {campaign.credits}크레딧</strong>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#746a3a]">
              <span>현재까지 {campaign.grantCount.toLocaleString("ko-KR")}명 지급</span>
              <span>{formatLimit(campaign.maxGrants)}</span>
              <span>{formatPeriod(campaign.startsAt, campaign.expiresAt)}</span>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#746a3a]"><ShieldCheck size={14} aria-hidden="true" />중지해도 이미 지급한 크레딧은 유지됩니다.</p>
          </div>
          <button type="button" className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-55 ${campaign.status === "active" ? "border border-[#d7c66d] bg-white text-[#695600]" : "bg-[#2f6bbf] text-white"}`} onClick={() => void toggleStatus()} disabled={isUpdating}>
            {isUpdating ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : campaign.status === "active" ? <PauseCircle size={17} aria-hidden="true" /> : <PlayCircle size={17} aria-hidden="true" />}
            {isUpdating ? "변경 중" : campaign.status === "active" ? "혜택 중지" : "혜택 다시 켜기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatLimit(maxGrants: number | null) {
  return maxGrants == null ? "지급 한도 없음" : `최대 ${maxGrants.toLocaleString("ko-KR")}명`;
}

function formatPeriod(startsAt: string, expiresAt: string | null) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${formatter.format(new Date(startsAt))} ~ ${expiresAt ? formatter.format(new Date(expiresAt)) : "제한 없음"}`;
}
