import { describe, expect, it } from "vitest";
import { normalizeSourceSystemTemplateBundleId, resolveWorkOriginBundleId } from "@/lib/theme/templateOrigin";

const bundleA = "abcdef01-2345-6789-abcd-ef0123456789";
const bundleB = "abcdef02-2345-6789-abcd-ef0123456789";

describe("normalizeSourceSystemTemplateBundleId", () => {
  it("lowercases a UUID and rejects everything else", () => {
    expect(normalizeSourceSystemTemplateBundleId(bundleA.toUpperCase())).toBe(bundleA);
    for (const value of ["", "basic", "pastel-glass", `${bundleA}:x`, 12, null, undefined]) {
      expect(normalizeSourceSystemTemplateBundleId(value)).toBeNull();
    }
  });
});

describe("resolveWorkOriginBundleId", () => {
  const base = { hasActiveUserTemplate: false, sourceSystemTemplateBundleId: null, activeSystemTemplateBundleId: null, systemTemplateBundleId: null };

  it("uses the edited system template's bundle when no user template is open", () => {
    expect(resolveWorkOriginBundleId({ ...base, activeSystemTemplateBundleId: bundleA })).toBe(bundleA);
    expect(resolveWorkOriginBundleId({ ...base, systemTemplateBundleId: bundleB })).toBe(bundleB);
  });

  it("trusts only the dedicated origin state once a user template is open", () => {
    // 시스템 템플릿에서 시작해 저장한 직후: activeSystemTemplate/systemTemplateBundleId가 남아 있어도 별도 상태가 기준이다.
    expect(resolveWorkOriginBundleId({ ...base, hasActiveUserTemplate: true, sourceSystemTemplateBundleId: bundleA, activeSystemTemplateBundleId: bundleB, systemTemplateBundleId: bundleB })).toBe(bundleA);
  });

  it("does not infer an origin for a user template whose record has none", () => {
    expect(resolveWorkOriginBundleId({ ...base, hasActiveUserTemplate: true, sourceSystemTemplateBundleId: null, activeSystemTemplateBundleId: bundleB, systemTemplateBundleId: bundleB })).toBeNull();
  });

  it("is null for a plain base template and for malformed ids", () => {
    expect(resolveWorkOriginBundleId(base)).toBeNull();
    expect(resolveWorkOriginBundleId({ ...base, activeSystemTemplateBundleId: "not-a-uuid" })).toBeNull();
  });
});
