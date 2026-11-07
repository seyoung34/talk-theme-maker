import { describe, expect, it } from "vitest";
import { toRecommendedAssetKey } from "@/lib/analytics/assetKey";

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
