import type { ReactNode } from "react";
import AdminPageHeader, { adminPageClassName } from "@/components/admin/shell/AdminPageHeader";
import { diagnosticOutcomeRate, diagnosticsFilters, diagnosticsPeriod, type DiagnosticsJob } from "@/lib/admin/exportDiagnostics";
import { loadExportDiagnostics } from "@/lib/admin/loadExportDiagnostics";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const duration = (value: number | null) => value === null ? "—" : `${Math.round(value).toLocaleString("ko-KR")} ms`;
const selectClassName = "h-9 rounded-lg border border-[var(--color-outline-variant)] bg-white px-3 focus-visible:outline-2 focus-visible:outline-[var(--color-info)]";

export default async function AdminExportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/exports");
  const filters = diagnosticsFilters(await searchParams);
  const period = diagnosticsPeriod(filters.days);
  const loaded = await loadExportDiagnostics(filters, period);
  const data = loaded.ok ? loaded.value : null;
  return (
    <main className={adminPageClassName}>
      <AdminPageHeader eyebrow="Export diagnostics" title="Export 진단" description="접수된 job 기준 · catalog 해석·권한·revision 검증 등 접수 전 실패는 포함하지 않습니다.">
        <form action="/admin/exports" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">기간<select name="days" defaultValue={filters.days} className={selectClassName}>{[1, 7, 30].map((days) => <option key={days} value={days}>최근 {days}일</option>)}</select></label>
          <label className="grid gap-1">플랫폼<select name="platform" defaultValue={filters.platform ?? ""} className={selectClassName}><option value="">전체</option><option value="android">Android</option><option value="ios">iOS</option></select></label>
          <label className="grid gap-1">Backend<select name="backend" defaultValue={filters.backend ?? ""} className={selectClassName}><option value="">전체</option><option value="worker">Worker</option><option value="cloud_run">Cloud Run</option><option value="unknown">미기록</option></select></label>
          <button type="submit" className="h-9 rounded-lg bg-[var(--color-info)] px-4 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-info)]">조회·새로고침</button>
        </form>
        <p className="text-xs text-[var(--color-on-surface-variant)]">{time.format(new Date(period.start))} 이상 ~ {time.format(new Date(period.end))} 미만(KST) · 접수 시각 기준 · 현재 시각부터 최근 {filters.days}일</p>
      </AdminPageHeader>
      {!data ? <p role="alert" className="rounded-xl border p-4">진단 데이터를 불러오지 못했습니다. 새로고침해 다시 조회해 주세요.</p> : <>
        <Section title="플랫폼별 요약">
          <Table headings={["플랫폼", "접수", "성공", "실패", "사용자 취소", "대기", "성공률 · 접수된 job 기준(취소 제외)", "p50", "p95", "duration 표본 / null 제외"]}>
            {data.summary.map((row) => <tr key={row.platform}>{[row.platform, row.total, row.succeeded, row.failed, row.cancelled, row.pending, diagnosticOutcomeRate(row.succeeded, row.total, row.cancelled), duration(row.p50), duration(row.p95), `${row.duration_count}건 / ${row.duration_null_count}건`].map((value, index) => <td key={index} className="px-4 py-3 tabular-nums">{value}</td>)}</tr>)}
          </Table>
          {data.summary.length === 0 && <Empty />}
          <p className="px-4 py-2 text-xs">성공률 분모는 접수 − 사용자 취소(성공·실패·대기 포함)입니다. 모두 취소된 경우 비율은 —로 표시합니다. duration은 취소를 포함해 값이 기록된 job만 집계합니다.</p>
        </Section>
        <Section title="실패 분포 · stage × error_code">
          <Table headings={["플랫폼", "Backend", "Stage", "오류 코드", "건수", "분포 막대"]}>
            {data.failures.map((row, index) => <tr key={index}><td className="px-4 py-3">{row.platform}</td><td className="px-4 py-3">{row.backend}</td><td className="px-4 py-3">{row.stage}</td><td className="px-4 py-3 font-mono">{row.error_code}</td><td className="px-4 py-3 tabular-nums">{row.count}</td><td className="px-4 py-3"><div aria-hidden="true" className="h-2 w-32 overflow-hidden rounded-full bg-[var(--color-surface-low)]"><div className="h-full rounded-full bg-[var(--color-info)]" style={{ width: `${row.count / Math.max(1, ...data.failures.map((item) => item.count)) * 100}%` }} /></div></td></tr>)}
          </Table>
          {data.failures.length === 0 && <Empty />}
          <p className="px-4 py-2 text-xs">사용자 취소는 실패 분포·최근 실패에서 제외합니다. 형식·길이 제한을 벗어난 오류 코드는 unknown으로 묶습니다. 오류 원문과 사용자 정보는 표시하지 않습니다.</p>
        </Section>
        <Section title="Catalog 비교">
          <Table headings={["구분", "접수", "실패", "사용자 취소", "실패율 · 접수된 job 기준(취소 제외)"]}>
            {data.catalog.map((row) => <tr key={String(row.catalog)}><td className="px-4 py-3">{row.catalog ? "Catalog 참조 있음" : "그 외 job"}</td><td className="px-4 py-3">{row.total}</td><td className="px-4 py-3">{row.failed}</td><td className="px-4 py-3">{row.cancelled}</td><td className="px-4 py-3">{diagnosticOutcomeRate(row.failed, row.total, row.cancelled)}</td></tr>)}
          </Table>
          {data.catalog.length === 0 && <Empty />}
          <p className="px-4 py-2 text-xs">실패율 분모는 접수 − 사용자 취소입니다. referenced_asset_file_count &gt; 0 기준 · 접수 전 실패 제외. 이 비교만으로 전체 시도 기준 rollout 성공률을 판단할 수 없습니다.</p>
        </Section>
        <Section title="최근 실패 20건"><JobTable jobs={data.recent} showError /></Section>
        <Section title={`15분 초과 pending · ${data.stale_count}건`}><p className="px-4 py-3 text-xs">기간과 무관한 현재 대기 작업 · 선택한 플랫폼·Backend 적용 · 오래된 순 최대 100건</p><JobTable jobs={data.stale} /></Section>
      </>}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="grid gap-2"><h2 className="text-base font-black">{title}</h2><div className="overflow-hidden rounded-2xl border border-[var(--color-outline-variant)] bg-white">{children}</div></section>;
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--color-surface-low)]"><tr>{headings.map((heading) => <th scope="col" key={heading} className="whitespace-nowrap px-4 py-3 text-xs font-bold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--color-outline-variant)]">{children}</tbody></table></div>;
}
function Empty() { return <p className="px-4 py-4 text-sm text-[var(--color-on-surface-variant)]">해당 작업이 없습니다.</p>; }
function JobTable({ jobs, showError = false }: { jobs: DiagnosticsJob[]; showError?: boolean }) {
  return <><Table headings={["Job ID", "플랫폼", "Backend", "Stage", ...(showError ? ["오류 코드"] : []), "접수 시각(KST)"]}>{jobs.map((job) => <tr key={job.id}><td className="px-4 py-3 font-mono text-xs">{job.id}</td><td className="px-4 py-3">{job.platform}</td><td className="px-4 py-3">{job.backend}</td><td className="px-4 py-3">{job.stage}</td>{showError && <td className="px-4 py-3 font-mono">{job.error_code}</td>}<td className="whitespace-nowrap px-4 py-3"><time dateTime={job.created_at}>{time.format(new Date(job.created_at))}</time></td></tr>)}</Table>{jobs.length === 0 && <Empty />}</>;
}
