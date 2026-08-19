import { describe, expect, it } from "vitest";
import {
  isAdminAssetAllowedForExport,
  isCatalogExportResourceRole,
  mapAdminAssetExportAccessRow,
  mapTemplateAssetExportAccessRows,
} from "@/lib/theme/assetCatalog/exportAccess";

const assetId = "11111111-1111-4111-8111-111111111111";

function access(overrides: Record<string, unknown> = {}) {
  return mapAdminAssetExportAccessRow({
    id: assetId,
    slot_role: "main_background",
    platform: "android",
    asset_kind: "background",
    enabled: true,
    admin_asset_targets: [
      { id: "target-1", asset_id: assetId, platform: "android", slot_role: "main_background", target_kind: "exact_role", priority: 0, enabled: true },
    ],
    ...overrides,
  });
}

describe("catalog export access", () => {
  it("플랫폼의 이미지 role만 export manifest에 사용할 수 있다", () => {
    expect(isCatalogExportResourceRole("main_background", "android")).toBe(true);
    expect(isCatalogExportResourceRole("chat_background_color", "android")).toBe(false);
    expect(isCatalogExportResourceRole("launcher_icon", "ios")).toBe(false);
  });

  it("현재 enabled와 exact target 정책을 통과시킨다", () => {
    expect(isAdminAssetAllowedForExport({ asset: access(), platform: "android", resourceRole: "main_background" })).toBe(true);
  });

  it.each([
    ["disabled", { enabled: false }],
    ["wrong platform", { platform: "ios" }],
    ["disabled target", { admin_asset_targets: [{ asset_id: assetId, platform: "android", slot_role: "main_background", target_kind: "exact_role", priority: 0, enabled: false }] }],
  ])("%s 에셋은 export에서 차단한다", (_label, overrides) => {
    expect(isAdminAssetAllowedForExport({ asset: access(overrides), platform: "android", resourceRole: "main_background" })).toBe(false);
  });

  it("호환되는 말풍선 role은 기존 추천 target 규칙처럼 허용한다", () => {
    const bubble = mapAdminAssetExportAccessRow({
      id: assetId,
      slot_role: "bubble_me_1",
      platform: "all",
      asset_kind: "bubble",
      enabled: true,
      admin_asset_targets: [{ asset_id: assetId, platform: "all", slot_role: "bubble_me_1", target_kind: "exact_role", priority: 0, enabled: true }],
    });
    expect(isAdminAssetAllowedForExport({ asset: bubble, platform: "ios", resourceRole: "bubble_me_2" })).toBe(true);
  });

  it("published/public 템플릿의 upload entry를 export 접근으로 만든다", () => {
    const uploadEntryId = "android-bubble-me-1:upload:1";
    expect(mapTemplateAssetExportAccessRows([
      {
        platform: "android",
        upload_refs: { bubble_me_1: [{ id: uploadEntryId, fileName: "bubble.png" }] },
        system_template_bundles: { status: "published", visibility: "public", created_by: "owner-a" },
      },
    ], { uploadEntryIds: [uploadEntryId], userId: "other-user" })).toEqual([
      { uploadEntryId, platform: "android" },
    ]);
  });

  it("private/draft 템플릿은 bundle 소유자에게만 export 접근을 준다", () => {
    const uploadEntryId = "ios-bubble-me-1:upload:1";
    const row = {
      platform: "ios",
      upload_refs: { bubble_me_1: [{ id: uploadEntryId }] },
      system_template_bundles: { status: "draft", visibility: "private", created_by: "owner-a" },
    };
    expect(mapTemplateAssetExportAccessRows([row], { uploadEntryIds: [uploadEntryId], userId: "other-user" })).toEqual([]);
    expect(mapTemplateAssetExportAccessRows([row], { uploadEntryIds: [uploadEntryId], userId: "owner-a" })).toEqual([
      { uploadEntryId, platform: "ios" },
    ]);
  });

  it("서로 다른 플랫폼 variant의 같은 upload id를 각각 기록한다", () => {
    const uploadEntryId = "shared:upload:1";
    expect(mapTemplateAssetExportAccessRows([
      { platform: "android", upload_refs: { a: [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
      { platform: "ios", upload_refs: { a: [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
    ], { uploadEntryIds: [uploadEntryId] })).toEqual([
      { uploadEntryId, platform: "android" },
      { uploadEntryId, platform: "ios" },
    ]);
  });
});
