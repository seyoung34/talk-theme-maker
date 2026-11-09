import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { parseTemplateUsage, templateUsageLabel, templateUsageRowLimit } from "./exportTemplateUsage";
import { loadExportTemplateUsage } from "./loadExportTemplateUsage";

const a = "abcdef01-2345-6789-abcd-ef0123456789";
const b = "abcdef02-2345-6789-abcd-ef0123456789";
const period = { start: "2026-11-01T00:00:00.000Z", end: "2026-11-08T00:00:00.000Z" };
const usage = {
  succeeded_jobs: 10, direct_jobs: 6, derived_jobs: 3, unrecorded_jobs: 1, include_admins: false, direct_bundle_count: 2, derived_bundle_count: 1,
  direct: [{ bundle_id: a, title: "파스텔 글라스", jobs: 4, accounts: 3, android: 3, ios: 1 }, { bundle_id: b, title: null, jobs: 2, accounts: 1, android: 2, ios: 0 }],
  derived: [{ bundle_id: a, title: "파스텔 글라스", jobs: 3, accounts: 2, android: 2, ios: 1 }],
};
const withRow = (patch: object, list: "direct" | "derived" = "direct") => ({ ...usage, [list]: [{ ...usage[list][0], ...patch }, ...usage[list].slice(1)] });
beforeEach(() => rpc.mockReset());

describe("parseTemplateUsage", () => {
  it("accepts a consistent aggregate and an empty one", () => {
    expect(parseTemplateUsage(usage)?.direct[1].title).toBeNull();
    expect(parseTemplateUsage({ succeeded_jobs: 0, direct_jobs: 0, derived_jobs: 0, unrecorded_jobs: 0, include_admins: true, direct_bundle_count: 0, derived_bundle_count: 0, direct: [], derived: [] })).not.toBeNull();
  });

  it.each([
    ["totals do not add up", { ...usage, unrecorded_jobs: 2 }],
    ["missing field", { ...usage, derived_jobs: undefined }],
    ["negative count", { ...usage, succeeded_jobs: -1 }],
    ["non-boolean include_admins", { ...usage, include_admins: "false" }],
    ["bundle count above jobs", { ...usage, direct_bundle_count: 7 }],
    ["rows exceed the bundle count", { ...usage, direct_bundle_count: 1 }],
    ["rows sum above the kind total", withRow({ jobs: 5, android: 4 })],
    ["complete list that does not add up to the kind total", { ...usage, direct_jobs: 7, succeeded_jobs: 11 }],
    ["accounts above jobs", withRow({ accounts: 5 })],
    ["zero accounts", withRow({ accounts: 0 })],
    ["platform split differs from jobs", withRow({ android: 1, ios: 1 })],
    ["non-uuid bundle id", withRow({ bundle_id: "pastel-glass" })],
    ["non-string title", withRow({ title: 7 })],
    ["rows not sorted by jobs", { ...usage, direct: [usage.direct[1], usage.direct[0]] }],
    ["truncated list that is not at the cap", { ...usage, direct_bundle_count: 5 }],
    ["not an object", "oops"],
  ])("rejects %s instead of showing zero", (_label, value) => {
    expect(parseTemplateUsage(value)).toBeNull();
  });

  it("rejects a list above the row cap even when the bundle count is large enough", () => {
    const rows = Array.from({ length: templateUsageRowLimit + 1 }, (_, index) => ({ bundle_id: `abcdef10-0000-4000-8000-${String(index).padStart(12, "0")}`, title: null, jobs: 1, accounts: 1, android: 1, ios: 0 }));
    expect(parseTemplateUsage({ succeeded_jobs: 200, direct_jobs: 200, derived_jobs: 0, unrecorded_jobs: 0, include_admins: false, direct_bundle_count: 200, derived_bundle_count: 0, direct: rows, derived: [] })).toBeNull();
  });

  it("allows a list truncated exactly at the cap", () => {
    const rows = Array.from({ length: templateUsageRowLimit }, (_, index) => ({ bundle_id: `abcdef10-0000-4000-8000-${String(index).padStart(12, "0")}`, title: null, jobs: 1, accounts: 1, android: 1, ios: 0 }));
    const truncated = { succeeded_jobs: 130, direct_jobs: 130, derived_jobs: 0, unrecorded_jobs: 0, include_admins: false, direct_bundle_count: 130, derived_bundle_count: 0, direct: rows, derived: [] };
    expect(parseTemplateUsage(truncated)?.direct).toHaveLength(templateUsageRowLimit);
  });
});

describe("loadExportTemplateUsage", () => {
  it("passes the period and the admin filter to the RPC", async () => {
    rpc.mockResolvedValue({ data: usage, error: null });
    const result = await loadExportTemplateUsage(period, false);

    expect(rpc).toHaveBeenCalledWith("admin_export_template_usage", { p_start: period.start, p_end: period.end, p_include_admins: false });
    expect(result.ok && result.value.direct_jobs).toBe(6);
  });

  it("rejects a response aggregated with a different admin filter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: usage, error: null });
    expect(await loadExportTemplateUsage(period, true)).toEqual({ ok: false });
    warn.mockRestore();
  });

  it("keeps a failed or malformed read distinct from an empty successful aggregate", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ data: null, error: new Error("private-database-error") });
    expect(await loadExportTemplateUsage(period, false)).toEqual({ ok: false });
    rpc.mockResolvedValue({ data: { ...usage, unrecorded_jobs: 99 }, error: null });
    expect(await loadExportTemplateUsage(period, false)).toEqual({ ok: false });
    rpc.mockRejectedValue(new Error("private-network-error"));
    expect(await loadExportTemplateUsage(period, false)).toEqual({ ok: false });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    rpc.mockResolvedValue({ data: { succeeded_jobs: 0, direct_jobs: 0, derived_jobs: 0, unrecorded_jobs: 0, include_admins: false, direct_bundle_count: 0, derived_bundle_count: 0, direct: [], derived: [] }, error: null });
    const empty = await loadExportTemplateUsage(period, false);
    expect(empty.ok && empty.value.succeeded_jobs).toBe(0);
    warn.mockRestore();
  });
});

describe("templateUsageLabel", () => {
  it("shows the title, truncates long titles and never invents a name", () => {
    expect(templateUsageLabel({ title: "파스텔 글라스" })).toBe("파스텔 글라스");
    expect(templateUsageLabel({ title: "가".repeat(80) })).toBe(`${"가".repeat(60)}…`);
    expect(templateUsageLabel({ title: null })).toBe("이름 미확인");
  });
});
