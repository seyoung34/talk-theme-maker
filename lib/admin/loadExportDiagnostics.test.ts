import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import { loadExportDiagnostics } from "./loadExportDiagnostics";
beforeEach(() => rpc.mockReset());
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
