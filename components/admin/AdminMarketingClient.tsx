"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import AdminPageHeader, { adminPageClassName, adminPageNarrowClassName } from "@/components/admin/shell/AdminPageHeader";
import { marketingLinks } from "@/lib/marketing/links";
import type { WeeklyMarketingReport } from "@/lib/marketing/weekly";
import type { AdminInitialData } from "@/lib/admin/initialData";

export default function AdminMarketingClient({ initialData }: { initialData?: AdminInitialData<WeeklyMarketingReport> }) {
  const [report, setReport] = useState<WeeklyMarketingReport | null>(initialData?.ok ? initialData.value : null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(initialData && !initialData.ok ? initialData.error : null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/marketing", { cache: "no-store" });
      const payload = (await response.json()) as { report?: WeeklyMarketingReport; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setReport(payload.report ?? null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "지표를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (!initialData) void load(); }, [initialData, load]);

  return (
    <main className={adminPageClassName}>
      <div className={adminPageNarrowClassName}>
        <AdminPageHeader
          eyebrow="Analytics"
          title="분석"
          description="홍보 링크 요청과 주간 전환을 봅니다."
          info={(
            <InfoTip label="지표 안내">
              분석 쿠키 동의와 무관한 숫자입니다. 링크 요청은 단축 링크 서버가 관측한 요청 수이며
              중복 요청·봇·링크 미리보기가 섞일 수 있습니다. 나머지는 서비스 운영 기록에서 옵니다.
              요청과 전환은 서로 연결되지 않습니다 — 누가 어느 캠페인에서 왔는지는 저장하지 않습니다.
            </InfoTip>
          )}
          actions={(
            <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#dbe8fb] bg-white px-3.5 text-xs font-bold text-[#5b6b82] transition hover:bg-[#f4f9ff]">
              <RefreshCw size={13} aria-hidden="true" />
              새로고침
            </button>
          )}
        />

        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff1f0] px-4 py-3 text-xs font-bold text-[#c0392b]">
            <AlertCircle size={14} aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          <h2 className="border-b border-[#e8eff8] px-5 py-4 text-sm font-extrabold text-[var(--color-on-surface)] sm:px-7">주간 지표 · 주차별</h2>
          {isLoading ? (
            <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">불러오는 중입니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[#e8eff8] text-[11px] font-black text-[#3d7bd6]">
                    <th className="px-5 py-3 text-left sm:px-7">주 시작 (KST)</th>
                    <th className="px-3 py-3 text-right">링크 요청</th>
                    <th className="px-3 py-3 text-right">가입 계정</th>
                    <th className="px-3 py-3 text-right">내보내기 완료 건</th>
                    <th className="px-5 py-3 text-right sm:px-7">결제 완료 건</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.weeks ?? []).map((week, index) => (
                    <tr key={week.weekStart} className={`border-b border-[#f1f5fa] last:border-b-0 ${index === (report?.weeks.length ?? 0) - 1 ? "bg-[#f7fbff] font-bold" : ""}`}>
                      <td className="px-5 py-3 font-semibold text-[var(--color-on-surface)] sm:px-7">{week.weekStart}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{week.redirectRequests}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{week.signups}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{week.exportsCompleted}</td>
                      <td className="px-5 py-3 text-right tabular-nums sm:px-7">{week.paymentsPaid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-[#e8eff8] px-5 py-3 text-[11px] font-semibold leading-relaxed text-[#8a99ad] sm:px-7">
            마지막 줄은 이번 주이며 아직 진행 중입니다. 링크 요청이 늘어난 주에 가입·내보내기·결제도
            함께 늘었는지까지가 이 표로 말할 수 있는 전부입니다 — 개별 전환의 캠페인 귀속이나 전환율은 알 수 없습니다.
          </p>
        </section>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          <h2 className="border-b border-[#e8eff8] px-5 py-4 text-sm font-extrabold text-[var(--color-on-surface)] sm:px-7">캠페인별 링크 요청</h2>
          {isLoading ? (
            <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">불러오는 중입니다.</p>
          ) : (report?.campaignRequests.length ?? 0) < 1 ? (
            <p className="px-5 py-12 text-center text-sm font-bold text-[#5b6b82]">아직 링크 요청이 없습니다. 아래 링크를 뿌리면 집계가 시작됩니다.</p>
          ) : (
            <ul>
              {report?.campaignRequests.map((row) => (
                <li key={row.campaign} className="flex items-center justify-between gap-3 border-b border-[#f1f5fa] px-5 py-3.5 last:border-b-0 sm:px-7">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-extrabold text-[var(--color-on-surface)]">{row.label}</strong>
                    <span className="text-[11px] font-semibold text-[#8a99ad]">{row.campaign}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{row.requests}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-[#dbe8fb] bg-white/92 shadow-[0_22px_62px_rgba(47,107,191,0.09)]">
          <h2 className="border-b border-[#e8eff8] px-5 py-4 text-sm font-extrabold text-[var(--color-on-surface)] sm:px-7">홍보 링크</h2>
          <ul>
            {Object.entries(marketingLinks).map(([code, link]) => (
              <li key={code} className="grid gap-1 border-b border-[#f1f5fa] px-5 py-3.5 last:border-b-0 sm:px-7">
                <code className="text-sm font-extrabold text-[#2f6bbf]">/r/{code}</code>
                <span className="text-[11px] font-semibold text-[#5b6b82]">{link.placement}</span>
                <span className="text-[11px] font-medium text-[#8a99ad]">{link.source} · {link.medium} · {link.campaign}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
