import { describe, expect, it } from "vitest";
import { shouldPersistCatalogReference } from "@/lib/theme/systemTemplates/supabaseRepository";

const catalog = {
  selection: {
    kind: "catalog" as const,
    assetId: "admin:asset-1",
    revision: 2,
    variantKey: "canonical",
  },
  fileName: "asset.png",
  mimeType: "image/png",
  size: 10,
  sourceScale: 3 as const,
  width: 120,
  height: 80,
  pngSignatureVerified: true,
};

describe("system template catalog upload refs", () => {
  it("fallback File이 수화돼도 편집하지 않은 catalog 선택은 ref로 보존한다", () => {
    expect(shouldPersistCatalogReference({ id: "entry-1", file: new File(["bytes"], "asset.png"), catalog, imageEdit: undefined })).toBe(true);
  });

  it("이미지 편집이 생기면 catalog ref 대신 새 바이트를 저장한다", () => {
    expect(shouldPersistCatalogReference({ id: "entry-1", file: new File(["bytes"], "asset.png"), catalog, imageEdit: { editedAt: 1 } as never })).toBe(false);
  });
});
