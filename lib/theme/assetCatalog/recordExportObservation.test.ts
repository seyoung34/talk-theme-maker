import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { recordExportCatalogObservation } from "./recordExportObservation";

describe("recordExportCatalogObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ error: null });
  });

  it("writes the bounded observation without altering the caller result", async () => {
    await expect(recordExportCatalogObservation("job", ["asset"], true)).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("record_export_catalog_observation", {
      p_job_id: "job", p_asset_ids: ["asset"], p_has_unobserved_sources: true,
    });
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("contains errors without logging job or asset values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.abortSignal.mockRejectedValue(new Error("private"));
    await expect(recordExportCatalogObservation("job", ["asset"], false)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("export_catalog_observation_failed");
    warn.mockRestore();
  });

  it("aborts a stalled request after one second and resolves", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mocks.abortSignal.mockImplementation((signal: AbortSignal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
      const result = recordExportCatalogObservation("job", [], false);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith("export_catalog_observation_failed");
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
