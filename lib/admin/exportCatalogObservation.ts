/**
 * 성공 export job에서 서버가 수락한 추천 catalog 참조 집계의 화면용 모델.
 *
 * 전체 실제 적용·추천 카드 직접 선택·설치 수가 아니다. 기록이 없는 job은 0이 아니라 `unknown`이다.
 */
export type CatalogObservationAssetRow = { asset_id: string; job_count: number };
export type CatalogObservationAggregate = {
  succeeded_jobs: number;
  observed_jobs: number;
  unknown_jobs: number;
  jobs_with_unobserved_manifest_sources: number;
  assets: CatalogObservationAssetRow[];
};
export type CatalogObservationAsset = CatalogObservationAssetRow & {
  /** 에셋이 삭제됐거나 이름을 읽지 못하면 null. 과거 참조는 유지하고 이름만 미확인으로 표시한다. */
  title: string | null;
  assetKind: string | null;
};
export type CatalogObservation = Omit<CatalogObservationAggregate, "assets"> & { assets: CatalogObservationAsset[] };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** RPC 응답이 계약과 다르면 null을 돌려준다. 모양이 틀린 응답을 0으로 바꿔 보여주지 않기 위해서다. */
export function parseCatalogObservation(value: unknown): CatalogObservationAggregate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { succeeded_jobs, observed_jobs, unknown_jobs, jobs_with_unobserved_manifest_sources, assets } = row;
  if (!isCount(succeeded_jobs) || !isCount(observed_jobs) || !isCount(unknown_jobs) || !isCount(jobs_with_unobserved_manifest_sources) || !Array.isArray(assets)) return null;
  if (observed_jobs + unknown_jobs !== succeeded_jobs || jobs_with_unobserved_manifest_sources > observed_jobs) return null;
  const parsed: CatalogObservationAssetRow[] = [];
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") return null;
    const { asset_id, job_count } = asset as Record<string, unknown>;
    if (typeof asset_id !== "string" || !uuidPattern.test(asset_id) || !isCount(job_count) || job_count < 1 || job_count > observed_jobs) return null;
    parsed.push({ asset_id: asset_id.toLowerCase(), job_count });
  }
  return { succeeded_jobs, observed_jobs, unknown_jobs, jobs_with_unobserved_manifest_sources, assets: parsed };
}

/** 표시용 라벨. 제목은 관리자가 입력한 값이므로 길이만 제한한다. */
export function catalogAssetLabel(asset: Pick<CatalogObservationAsset, "title" | "assetKind">): string {
  if (!asset.title) return "이름 미확인";
  const title = asset.title.length > 60 ? `${asset.title.slice(0, 60)}…` : asset.title;
  return asset.assetKind ? `${title} · ${asset.assetKind}` : title;
}
