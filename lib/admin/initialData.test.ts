import { describe, expect, it, vi } from "vitest";
import { loadAdminInitialData } from "./initialData";

describe("initial list result", () => {
  it("distinguishes a successful empty list from a failed lookup", async () => {
    expect(await loadAdminInitialData(async () => [], "조회 실패")).toEqual({ ok: true, value: [] });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await loadAdminInitialData(async () => { throw new Error("provider details"); }, "조회 실패"))
        .toEqual({ ok: false, error: "조회 실패" });
    } finally { warning.mockRestore(); }
  });
});
