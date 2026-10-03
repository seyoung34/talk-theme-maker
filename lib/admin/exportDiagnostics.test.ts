import { describe, expect, it } from "vitest";
import { diagnosticRate, diagnosticsFilters, diagnosticsPeriod, safeDiagnosticErrorCode } from "./exportDiagnostics";

describe("export diagnostics display boundaries", () => {
  it("never displays arbitrary error contents", () => {
    for (const input of [null, "", "Email@example.com", "a b", "한글", "a".repeat(65), "code\n", {}]) expect(safeDiagnosticErrorCode(input)).toBe("unknown");
    expect(safeDiagnosticErrorCode("a".repeat(64))).toBe("a".repeat(64));
    expect(safeDiagnosticErrorCode("build.cancelled-1")).toBe("build.cancelled-1");
  });
  it("uses one clock and an exact elapsed-day window", () => {
    expect(diagnosticsPeriod(7, new Date("2026-10-03T15:00:00Z"))).toEqual({ start: "2026-09-26T15:00:00.000Z", end: "2026-10-03T15:00:00.000Z" });
  });
  it("validates filters and does not turn an empty denominator into 0%", () => {
    expect(diagnosticsFilters({ days: "100", platform: ["ios"], backend: "invalid" })).toEqual({ days: 7, platform: null, backend: null });
    expect(diagnosticsFilters({ days: "30", platform: "ios", backend: "unknown" })).toEqual({ days: 30, platform: "ios", backend: "unknown" });
    expect(diagnosticRate(0, 0)).toBe("—");
    expect(diagnosticRate(1, 3)).toBe("33.3%");
  });
});
