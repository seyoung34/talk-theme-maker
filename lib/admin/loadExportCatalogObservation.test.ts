import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, inQuery } = vi.hoisted(() => ({ rpc: vi.fn(), inQuery: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc, from: () => ({ select: () => ({ in: inQuery }) }) }) }));
import { catalogAssetLabel, parseCatalogObservation } from "./exportCatalogObservation";
import { loadExportCatalogObservation } from "./loadExportCatalogObservation";

const a = "abcdef01-2345-6789-abcd-ef0123456789";
const b = "abcdef02-2345-6789-abcd-ef0123456789";
function manyIds(count: number) {
  return Array.from({ length: count }, (_, index) => `abcdef01-2345-6789-abcd-${String(index).padStart(12, "0")}`);
}
function manyAggregate(ids: string[]) {
  return { succeeded_jobs: 500, observed_jobs: 400, unknown_jobs: 100, jobs_with_unobserved_manifest_sources: 0, assets: ids.map((asset_id, index) => ({ asset_id, job_count: 300 - index })) };
}
const period = { start: "2026-11-01T00:00:00.000Z", end: "2026-11-08T00:00:00.000Z" };
const aggregate = { succeeded_jobs: 10, observed_jobs: 6, unknown_jobs: 4, jobs_with_unobserved_manifest_sources: 2, assets: [{ asset_id: a, job_count: 5 }, { asset_id: b, job_count: 1 }] };

beforeEach(() => { rpc.mockReset(); inQuery.mockReset(); });

describe("parseCatalogObservation", () => {
  it("accepts a consistent aggregate and lowercases ids", () => {
    expect(parseCatalogObservation({ ...aggregate, assets: [{ asset_id: a.toUpperCase(), job_count: 5 }] })?.assets[0].asset_id).toBe(a);
    expect(parseCatalogObservation({ succeeded_jobs: 0, observed_jobs: 0, unknown_jobs: 0, jobs_with_unobserved_manifest_sources: 0, assets: [] })).not.toBeNull();
  });

  it.each([
    ["missing field", { ...aggregate, unknown_jobs: undefined }],
    ["observed + unknown != succeeded", { ...aggregate, unknown_jobs: 3 }],
    ["unobserved sources exceed observed jobs", { ...aggregate, jobs_with_unobserved_manifest_sources: 7 }],
    ["negative count", { ...aggregate, succeeded_jobs: -1 }],
    ["non-integer count", { ...aggregate, observed_jobs: 6.5 }],
    ["asset count above observed jobs", { ...aggregate, assets: [{ asset_id: a, job_count: 7 }] }],
    ["zero asset count", { ...aggregate, assets: [{ asset_id: a, job_count: 0 }] }],
    ["non-uuid asset id", { ...aggregate, assets: [{ asset_id: "pastel-glass", job_count: 1 }] }],
    ["assets not an array", { ...aggregate, assets: null }],
    ["not an object", "oops"],
  ])("rejects %s instead of showing zero", (_label, value) => {
    expect(parseCatalogObservation(value)).toBeNull();
  });
});

describe("loadExportCatalogObservation", () => {
  it("joins asset names and marks deleted assets as unnamed", async () => {
    rpc.mockResolvedValue({ data: aggregate, error: null });
    inQuery.mockResolvedValue({ data: [{ id: a, title: "파스텔 배경", asset_kind: "background" }], error: null });
    const result = await loadExportCatalogObservation(period);

    expect(rpc).toHaveBeenCalledWith("admin_export_catalog_observation", { p_start: period.start, p_end: period.end });
    expect(result.ok && result.value.assets).toEqual([
      { asset_id: a, job_count: 5, title: "파스텔 배경", assetKind: "background" },
      { asset_id: b, job_count: 1, title: null, assetKind: null },
    ]);
  });

  it("keeps the counts when the name lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: aggregate, error: null });
    inQuery.mockResolvedValue({ data: null, error: new Error("private-database-error") });
    const result = await loadExportCatalogObservation(period);

    expect(result.ok && result.value.observed_jobs).toBe(6);
    expect(result.ok && result.value.assets.every((asset) => asset.title === null)).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    warn.mockRestore();
  });

  it("keeps the counts when the name lookup rejects or throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: aggregate, error: null });
    inQuery.mockRejectedValue(new Error("private-network-error"));
    const rejected = await loadExportCatalogObservation(period);
    expect(rejected.ok && rejected.value.observed_jobs).toBe(6);
    expect(rejected.ok && rejected.value.assets.map((asset) => asset.title)).toEqual([null, null]);
    inQuery.mockImplementation(() => { throw new Error("private-sync-error"); });
    const thrown = await loadExportCatalogObservation(period);
    expect(thrown.ok && thrown.value.succeeded_jobs).toBe(10);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    warn.mockRestore();
  });

  it("looks names up in batches and drops partial names when a later batch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ids = manyIds(85);
    rpc.mockResolvedValue({ data: manyAggregate(ids), error: null });
    inQuery.mockResolvedValueOnce({ data: [{ id: ids[0], title: "첫 배치", asset_kind: "icon" }], error: null })
      .mockRejectedValueOnce(new Error("private-network-error"));
    const result = await loadExportCatalogObservation(period);

    expect(inQuery.mock.calls.map(([, batch]) => (batch as string[]).length)).toEqual([40, 40]);
    expect(result.ok && result.value.assets.every((asset) => asset.title === null)).toBe(true);
    warn.mockRestore();
  });

  it("caps the displayed assets, reports the full count and batches the lookup", async () => {
    const ids = manyIds(130);
    rpc.mockResolvedValue({ data: manyAggregate(ids), error: null });
    inQuery.mockImplementation(async (_column: string, batch: string[]) => ({ data: batch.map((id) => ({ id, title: `에셋 ${id.slice(-4)}`, asset_kind: "icon" })), error: null }));
    const result = await loadExportCatalogObservation(period);

    expect(result.ok && result.value.totalAssetCount).toBe(130);
    expect(result.ok && result.value.assets).toHaveLength(100);
    expect(result.ok && result.value.assets[0].asset_id).toBe(ids[0]);
    expect(result.ok && result.value.assets[0].title).toBe(`에셋 ${ids[0].slice(-4)}`);
    expect(inQuery.mock.calls.map(([, batch]) => (batch as string[]).length)).toEqual([40, 40, 20]);
  });

  it("keeps a failed aggregate distinct from an empty successful one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error("private-database-error") });
    expect(await loadExportCatalogObservation(period)).toEqual({ ok: false });
    rpc.mockResolvedValue({ data: { ...aggregate, observed_jobs: 5 }, error: null });
    expect(await loadExportCatalogObservation(period)).toEqual({ ok: false });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    rpc.mockResolvedValue({ data: { succeeded_jobs: 0, observed_jobs: 0, unknown_jobs: 0, jobs_with_unobserved_manifest_sources: 0, assets: [] }, error: null });
    const empty = await loadExportCatalogObservation(period);
    expect(empty.ok && empty.value.assets).toEqual([]);
    expect(inQuery).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("catalogAssetLabel", () => {
  it("shows the title with its kind, truncates long titles and never invents a name", () => {
    expect(catalogAssetLabel({ title: "파스텔 배경", assetKind: "background" })).toBe("파스텔 배경 · background");
    expect(catalogAssetLabel({ title: "가".repeat(80), assetKind: null })).toBe(`${"가".repeat(60)}…`);
    expect(catalogAssetLabel({ title: null, assetKind: "icon" })).toBe("이름 미확인");
  });
});
