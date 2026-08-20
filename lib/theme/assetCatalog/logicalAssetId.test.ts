import { describe, expect, it } from "vitest";
import {
  adminLogicalAssetId,
  canonicalVariantKey,
  isLogicalAssetId,
  LogicalAssetIdError,
  parseLogicalAssetId,
  templateLogicalAssetId,
} from "@/lib/theme/assetCatalog/logicalAssetId";

describe("logical asset id", () => {
  it("출처별 접두를 붙인다", () => {
    expect(adminLogicalAssetId("c822775e-d341-4fef-a6ff-812657700cca")).toBe("admin:c822775e-d341-4fef-a6ff-812657700cca");
    expect(templateLogicalAssetId("android-bubble-me-1:upload:1785660295620")).toBe("tpl:android-bubble-me-1:upload:1785660295620");
  });

  /**
   * 이 접두가 존재하는 이유. `selectAdminAsset()`이 업로드 항목 id를 `asset.id`로 그대로 넣어서,
   * 추천 에셋에서 온 템플릿 항목은 원래 id가 admin_assets.id와 같다. 접두가 없으면 한 행으로
   * 합쳐지고 관리자 갱신이 템플릿까지 전파된다.
   */
  it("같은 원본 id라도 출처가 다르면 다른 논리 자산이 된다", () => {
    const shared = "c822775e-d341-4fef-a6ff-812657700cca";
    expect(adminLogicalAssetId(shared)).not.toBe(templateLogicalAssetId(shared));
  });

  it("왕복 파싱이 원래 id를 복원한다", () => {
    const ids = [
      "c822775e-d341-4fef-a6ff-812657700cca",
      "admin-asset:1781680542261:xqcxdi",
      "android-common-splash-landscape:upload:1785839514266",
    ];
    for (const id of ids) {
      expect(parseLogicalAssetId(adminLogicalAssetId(id))).toEqual({ kind: "admin", sourceId: id });
      expect(parseLogicalAssetId(templateLogicalAssetId(id))).toEqual({ kind: "template", sourceId: id });
    }
  });

  // 업로드 항목 id 자체가 콜론을 포함하므로 첫 콜론으로 자르면 안 된다.
  it("콜론이 여러 개인 id를 잘라 먹지 않는다", () => {
    const parsed = parseLogicalAssetId("tpl:admin-asset:1781680542261:xqcxdi");
    expect(parsed).toEqual({ kind: "template", sourceId: "admin-asset:1781680542261:xqcxdi" });
  });

  it("접두가 없거나 빈 id를 거부한다", () => {
    expect(() => parseLogicalAssetId("c822775e-d341-4fef-a6ff-812657700cca")).toThrow(LogicalAssetIdError);
    expect(() => parseLogicalAssetId("other:x")).toThrow(LogicalAssetIdError);
    expect(() => parseLogicalAssetId("tpl:")).toThrow(LogicalAssetIdError);
    expect(() => adminLogicalAssetId("   ")).toThrow(LogicalAssetIdError);
  });

  it("isLogicalAssetId가 예외 없이 판정한다", () => {
    expect(isLogicalAssetId("admin:abc")).toBe(true);
    expect(isLogicalAssetId("tpl:abc")).toBe(true);
    expect(isLogicalAssetId("abc")).toBe(false);
    expect(isLogicalAssetId("")).toBe(false);
  });

  it("backfill은 canonical variant를 쓴다", () => {
    expect(canonicalVariantKey).toBe("canonical");
  });
});
