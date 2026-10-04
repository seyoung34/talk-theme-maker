import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { loadExportDiagnostics } from "./loadExportDiagnostics";
beforeEach(() => rpc.mockReset());
it("rejects missing or inconsistent cancellation counts instead of assuming zero", async () => {
  for (const row of [{ total: 10, failed: 2 }, { total: 10, failed: 2, cancelled: 11 }, { total: 10, failed: 3, cancelled: 8 }]) {
    for (const key of ["summary", "catalog"]) {
      rpc.mockResolvedValue({ data: { summary: [], catalog: [], failures: [], recent: [], stale: [], stale_count: 0, [key]: [row] }, error: null });
      expect(await loadExportDiagnostics({ days: 7, platform: null, backend: null }, { start: "start", end: "end" })).toEqual({ ok: false });
    }
  }
});
it("keeps a failed read distinct from an empty successful aggregate", async () => {
  rpc.mockResolvedValue({ error: new Error("private"), data: null });
  expect(await loadExportDiagnostics({ days: 7, platform: null, backend: null }, { start: "start", end: "end" })).toEqual({ ok: false });
  rpc.mockResolvedValue({ error: null, data: { summary: [], failures: [], catalog: [], recent: [], stale: [], stale_count: 0 } });
  expect((await loadExportDiagnostics({ days: 7, platform: "ios", backend: null }, { start: "start", end: "end" })).ok).toBe(true);
  expect(rpc).toHaveBeenLastCalledWith("admin_export_diagnostics", { p_start: "start", p_end: "end", p_platform: "ios", p_backend: null });
});
it("sanitizes codes again before display", async () => {
  rpc.mockResolvedValue({ data: { summary: [], failures: [{ error_code: "secret@example.com" }], catalog: [], recent: [{ error_code: "secret\n" }], stale: [], stale_count: 0 }, error: null });
  const result = await loadExportDiagnostics({ days: 7, platform: null, backend: null }, { start: "start", end: "end" });
  expect(result.ok && result.value.failures[0]?.error_code).toBe("unknown");
  expect(result.ok && result.value.recent[0]?.error_code).toBe("unknown");
});
