/**
 * 템플릿별 성공 export 집계의 화면용 모델.
 *
 * 직접 사용(`system_template_bundle_id`)과 내 템플릿 파생 출처(`source_system_template_bundle_id`)는
 * 서로 다른 의미라 합산하지 않는다. 출처가 없는 job은 기본 템플릿이 아니라 "알 수 없음"이다.
 * 두 값 모두 클라이언트가 보낸 집계용 값이며 권한·과금에 쓰지 않는다.
 */
export type TemplateUsageRow = { bundle_id: string; title: string | null; jobs: number; accounts: number; android: number; ios: number };
export type TemplateUsage = {
  succeeded_jobs: number;
  direct_jobs: number;
  derived_jobs: number;
  unrecorded_jobs: number;
  include_admins: boolean;
  direct_bundle_count: number;
  derived_bundle_count: number;
  direct: TemplateUsageRow[];
  derived: TemplateUsageRow[];
};

/** RPC가 구분마다 돌려주는 최대 행 수. 이보다 적은데 전체 bundle 수가 더 크면 응답이 틀린 것이다. */
export const templateUsageRowLimit = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

function parseRows(value: unknown, kindJobs: number, bundleCount: number): TemplateUsageRow[] | null {
  if (!Array.isArray(value) || value.length > bundleCount) return null;
  if (bundleCount > value.length && value.length !== templateUsageRowLimit) return null;
  const rows: TemplateUsageRow[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { bundle_id, title, jobs, accounts, android, ios } = item as Record<string, unknown>;
    if (typeof bundle_id !== "string" || !uuidPattern.test(bundle_id) || !(title === null || typeof title === "string")) return null;
    if (!isCount(jobs) || !isCount(accounts) || !isCount(android) || !isCount(ios)) return null;
    if (jobs < 1 || accounts < 1 || accounts > jobs || android + ios !== jobs) return null;
    // RPC는 job 수 내림차순이다. 어긋나면 순위를 믿을 수 없으므로 거부한다.
    if (rows.length > 0 && jobs > rows[rows.length - 1].jobs) return null;
    total += jobs;
    rows.push({ bundle_id: bundle_id.toLowerCase(), title: title === null || title.trim() === "" ? null : title, jobs, accounts, android, ios });
  }
  // 목록이 잘리지 않았다면 모든 bundle이 있어야 하고, 어떤 경우에도 표의 합이 해당 구분의 전체를 넘을 수 없다.
  if (total > kindJobs || (bundleCount <= value.length && total !== kindJobs)) return null;
  return rows;
}

/** RPC 응답이 계약과 다르면 null을 돌려준다. 모양이 틀린 응답을 0으로 바꿔 보여주지 않기 위해서다. */
export function parseTemplateUsage(value: unknown): TemplateUsage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { succeeded_jobs, direct_jobs, derived_jobs, unrecorded_jobs, include_admins, direct_bundle_count, derived_bundle_count } = row;
  if (!isCount(succeeded_jobs) || !isCount(direct_jobs) || !isCount(derived_jobs) || !isCount(unrecorded_jobs)
    || !isCount(direct_bundle_count) || !isCount(derived_bundle_count) || typeof include_admins !== "boolean") return null;
  if (direct_jobs + derived_jobs + unrecorded_jobs !== succeeded_jobs) return null;
  if (direct_bundle_count > direct_jobs || derived_bundle_count > derived_jobs) return null;
  const direct = parseRows(row.direct, direct_jobs, direct_bundle_count);
  const derived = parseRows(row.derived, derived_jobs, derived_bundle_count);
  if (!direct || !derived) return null;
  return { succeeded_jobs, direct_jobs, derived_jobs, unrecorded_jobs, include_admins, direct_bundle_count, derived_bundle_count, direct, derived };
}

/** 삭제됐거나 이름을 읽지 못한 템플릿은 ID만 남기고 이름 미확인으로 표시한다. */
export function templateUsageLabel(row: Pick<TemplateUsageRow, "title">): string {
  if (!row.title) return "이름 미확인";
  return row.title.length > 60 ? `${row.title.slice(0, 60)}…` : row.title;
}
