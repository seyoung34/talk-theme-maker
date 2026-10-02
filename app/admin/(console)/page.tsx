import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import OverviewSparkline from "@/components/admin/overview/OverviewSparkline";
import { loadAdminOverview } from "@/lib/admin/loadOverview";
import { formatCount, type OverviewCard, type OverviewHistoryRow } from "@/lib/admin/overview";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPage() {
  await requireAdmin("/admin");
  const overview = await loadAdminOverview();
  const attentionCount = overview.attention.filter((card) => card.emphasized).length;

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">Overview</p>
          <h1 className="mt-1 font-[var(--font-display)] text-3xl font-semibold text-[var(--color-on-surface)]">개요</h1>
        </div>
        <p className="text-xs font-bold text-[var(--color-on-surface-variant)]">
          {timeFormatter.format(new Date())} 기준 · 새로고침하면 다시 조회합니다
        </p>
      </header>

      <section aria-labelledby="overview-attention" className="grid gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="overview-attention" className="text-base font-black text-[var(--color-on-surface)]">처리 필요</h2>
          <span className="text-xs font-bold text-[var(--color-on-surface-variant)]">
            {attentionCount > 0 ? `${attentionCount}개 항목 확인 필요` : "확인된 처리 항목 없음"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {overview.attention.map((card) => <StatCard key={card.id} card={card} />)}
        </div>
      </section>

      <section aria-labelledby="overview-today" className="grid gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="overview-today" className="text-base font-black text-[var(--color-on-surface)]">오늘</h2>
          <span className="text-xs font-bold text-[var(--color-on-surface-variant)]">{overview.day} 00:00(KST)부터 · 서비스 운영 기록 기준</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {overview.today.map((card) => <StatCard key={card.id} card={card} />)}
        </div>
        <HistoryTable rows={overview.history} />
      </section>

      <section aria-labelledby="overview-issues" className="grid gap-3">
        <h2 id="overview-issues" className="text-base font-black text-[var(--color-on-surface)]">최근 P1·P2 이슈</h2>
        <div className="overflow-hidden rounded-2xl border border-[var(--color-outline-variant)] bg-white">
          {!overview.issues.ok ? (
            <p className="px-4 py-4 text-sm font-bold text-[var(--color-on-surface-variant)]">이슈 목록을 불러오지 못했습니다.</p>
          ) : overview.issues.value.length === 0 ? (
            <p className="px-4 py-4 text-sm font-bold text-[var(--color-on-surface-variant)]">최근 이슈가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-outline-variant)]">
              {overview.issues.value.map((issue) => (
                <li key={issue.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black ${issue.severity === "P1" ? "bg-[var(--color-error)] text-[var(--color-on-error)]" : "bg-[var(--color-error-container)] text-[var(--color-on-error-container)]"}`}>
                    {issue.severity}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold text-[var(--color-on-surface)]">{issue.label}</span>
                  <time dateTime={issue.occurredAt} className="shrink-0 text-xs font-semibold text-[var(--color-on-surface-variant)]">
                    {timeFormatter.format(new Date(issue.occurredAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function StatCard({ card }: { card: OverviewCard }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-[var(--color-on-surface-variant)]">{card.label}</span>
        {card.href ? <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-[var(--color-on-surface-variant)]" /> : null}
      </div>
      {card.unavailable ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-black text-[var(--color-on-surface-variant)]">
          <AlertTriangle size={15} aria-hidden="true" />
          불러오지 못함
        </p>
      ) : (
        <p className={`mt-2 font-[var(--font-display)] text-3xl font-semibold ${card.emphasized ? "text-[var(--color-error)]" : "text-[var(--color-on-surface)]"}`}>{card.value}</p>
      )}
      {card.hint ? <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-on-surface-variant)]">{card.hint}</p> : null}
      {card.trend ? <OverviewSparkline label={card.label} points={card.trend} /> : null}
    </>
  );

  const className = [
    "flex flex-col rounded-2xl border bg-white p-4 transition",
    card.emphasized ? "border-[var(--color-error)] shadow-[0_0_0_1px_var(--color-error)]" : "border-[var(--color-outline-variant)]",
    card.href ? "hover:bg-[var(--color-surface-low)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]" : "",
  ].join(" ");

  return card.href ? <Link href={card.href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

const historyColumns: { label: string; pick: (row: Required<OverviewHistoryRow>["counts"]) => number }[] = [
  { label: "가입", pick: (counts) => counts.signups },
  { label: "결제", pick: (counts) => counts.paymentsPaid },
  { label: "환불", pick: (counts) => counts.refundsCount },
  { label: "export 성공", pick: (counts) => counts.exportsSucceeded },
  { label: "export 실패", pick: (counts) => counts.exportsFailed },
  { label: "P1·P2", pick: (counts) => counts.p1Issues + counts.p2Issues },
];

/** 추이 차트와 같은 값을 표로 읽는 보기. 차트를 못 보는 환경과 정확한 수치 확인용이다. */
function HistoryTable({ rows }: { rows: OverviewHistoryRow[] }) {
  return (
    <details className="group rounded-2xl border border-[var(--color-outline-variant)] bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--color-on-surface-variant)] marker:text-[var(--color-outline)]">
        최근 {rows.length}일 표로 보기
      </summary>
      <div className="overflow-x-auto border-t border-[var(--color-outline-variant)]">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-xs font-black text-[var(--color-on-surface-variant)]">
              <th scope="col" className="px-4 py-2">날짜(KST)</th>
              {historyColumns.map((column) => <th key={column.label} scope="col" className="px-4 py-2 text-right">{column.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-outline-variant)]">
            {rows.map((row) => (
              <tr key={row.day}>
                <th scope="row" className="px-4 py-2 font-bold text-[var(--color-on-surface)]">{row.day}</th>
                {historyColumns.map((column) => (
                  <td key={column.label} className="px-4 py-2 text-right font-semibold tabular-nums text-[var(--color-on-surface)]">
                    {row.counts ? formatCount(column.pick(row.counts)) : <span className="text-[var(--color-on-surface-variant)]">확인 불가</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
