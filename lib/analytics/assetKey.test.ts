import { describe, expect, it } from "vitest";
import { buildCandidateSelectedParams, toRecommendedAssetKey } from "@/lib/analytics/assetKey";

const uuid = "abcdef01-2345-6789-abcd-ef0123456789";

describe("buildCandidateSelectedParams", () => {
  it("adds asset_key only when the recommended card path passes the id", () => {
    expect(buildCandidateSelectedParams({ slotRole: "main_background", section: "main", assetSource: "admin", recommendedAssetId: uuid })).toEqual({
      slot_role: "main_background",
      section: "main",
      asset_source: "admin",
      asset_key: uuid,
    });
  });

  it("omits asset_key on the generic path even when the source is admin or the id is a UUID", () => {
    // 템플릿 사본이 추천 에셋과 같은 UUID를 가진 경우: 일반 후보 경로는 recommendedAssetId를 넘기지 않는다.
    const params = buildCandidateSelectedParams({ slotRole: "main_background", section: "main", assetSource: "admin" });
    expect(params).toEqual({ slot_role: "main_background", section: "main", asset_source: "admin" });
    expect("asset_key" in params).toBe(false);
  });

  it("drops non-UUID recommended ids instead of sending them", () => {
    const params = buildCandidateSelectedParams({ slotRole: "main_background", section: "main", assetSource: "admin", recommendedAssetId: "main_background:upload:1" });
    expect("asset_key" in params).toBe(false);
  });
});

describe("toRecommendedAssetKey", () => {
  it("passes a UUID through in lowercase", () => {
    expect(toRecommendedAssetKey("ABCDEF01-2345-6789-ABCD-EF0123456789")).toBe("abcdef01-2345-6789-abcd-ef0123456789");
  });

  it.each([
    ["user upload id", "main_background:upload:1730000000000"],
    ["bubble copy id", "bubble_me:bubble-copy:1730000000000"],
    ["template candidate id", "basic-main-background"],
    ["title-like text", "파스텔 글라스 배경"],
    ["file path", "admin-assets/abc/file.png"],
    ["url", "https://example.com/a.png"],
    ["uuid with suffix", "abcdef01-2345-6789-abcd-ef0123456789:extra"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(toRecommendedAssetKey(value)).toBeUndefined();
  });

  it("rejects missing values", () => {
    expect(toRecommendedAssetKey(undefined)).toBeUndefined();
    expect(toRecommendedAssetKey(null)).toBeUndefined();
  });
});
