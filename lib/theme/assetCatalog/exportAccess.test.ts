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
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "android" },
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
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "ios" },
    ]);
  });

  it("서로 다른 플랫폼 variant의 같은 upload id를 각각 기록한다", () => {
    const uploadEntryId = "shared:upload:1";
    expect(mapTemplateAssetExportAccessRows([
      { platform: "android", upload_refs: { a: [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
      { platform: "ios", upload_refs: { a: [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
    ], { uploadEntryIds: [uploadEntryId] })).toEqual([
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "android" },
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "ios" },
    ]);
  });
});

/**
 * 권한 경로의 기본값은 거부다. 조회가 `enabled`를 빠뜨리면(성능 목적으로 select 목록을 줄이는
 * 등) 비활성 에셋이 조용히 통과하는 일이 없어야 한다.
 */
describe("enabled 플래그는 fail-closed다", () => {
  const base = {
    id: "3f1a4b2c-0000-4000-8000-000000000001",
    slot_role: "main_background",
    platform: "android",
    asset_kind: "background",
  };

  it("명시적 true만 허용한다", () => {
    expect(mapAdminAssetExportAccessRow({ ...base, enabled: true }).enabled).toBe(true);
  });

  it.each([
    ["필드 누락", {}],
    ["null", { enabled: null }],
    ["문자열 true", { enabled: "true" }],
    ["숫자 1", { enabled: 1 }],
    ["false", { enabled: false }],
  ])("%s는 거부한다", (_label, overrides) => {
    expect(mapAdminAssetExportAccessRow({ ...base, ...overrides }).enabled).toBe(false);
  });
});

/**
 * 발행된 시스템 템플릿은 자기 내용물의 권한 근거다.
 *
 * catalog 도입 전에는 템플릿이 추천 에셋의 **자기 사본**(`system-templates/…`)을 들고 있어서,
 * 운영자가 그 에셋을 지워도 템플릿은 멀쩡했다. 지금은 중복 제거를 위해 `admin:<uuid>`를
 * 참조만 하므로, 라이브러리 정책을 그대로 적용하면 삭제·타겟 변경 한 번에 이미 팔린 템플릿의
 * 내보내기가 403이 된다. 관리자 삭제는 하드 삭제라 Supabase 바이트까지 사라진다.
 */
describe("템플릿에 박힌 admin catalog ref", () => {
  const adminLogicalId = "admin:3f1a4b2c-0000-4000-8000-000000000001";

  function templateRow(overrides: Record<string, unknown> = {}) {
    return {
      platform: "android",
      upload_refs: {
        main_background: [{
          id: "android-main-background:upload:1",
          fileName: "bg.png",
          catalog: { kind: "catalog", assetId: adminLogicalId, revision: 2, variantKey: "canonical" },
        }],
      },
      system_template_bundles: { status: "published", visibility: "public", created_by: "owner-a" },
      ...overrides,
    };
  }

  it("발행된 공개 템플릿 안의 admin ref에 접근을 준다", () => {
    expect(mapTemplateAssetExportAccessRows([templateRow()], {
      uploadEntryIds: [],
      catalogAssetIds: [adminLogicalId],
      userId: "other-user",
    })).toEqual([{ logicalAssetId: adminLogicalId, platform: "android" }]);
  });

  it("요청하지 않은 admin ref는 돌려주지 않는다", () => {
    expect(mapTemplateAssetExportAccessRows([templateRow()], {
      uploadEntryIds: [],
      catalogAssetIds: ["admin:3f1a4b2c-0000-4000-8000-0000000000ff"],
      userId: "other-user",
    })).toEqual([]);
  });

  // 접근 근거는 어디까지나 "이 사용자가 볼 수 있는 템플릿"이다. 비공개 초안까지 열어 주지 않는다.
  it("남의 비공개 초안 안에 있으면 접근을 주지 않는다", () => {
    expect(mapTemplateAssetExportAccessRows([
      templateRow({ system_template_bundles: { status: "draft", visibility: "private", created_by: "owner-a" } }),
    ], { uploadEntryIds: [], catalogAssetIds: [adminLogicalId], userId: "other-user" })).toEqual([]);
  });

  it("같은 자산이 Android/iOS 템플릿에 함께 있으면 플랫폼별로 준다", () => {
    expect(mapTemplateAssetExportAccessRows([
      templateRow(),
      templateRow({ platform: "ios" }),
    ], { uploadEntryIds: [], catalogAssetIds: [adminLogicalId], userId: "u" })).toEqual([
      { logicalAssetId: adminLogicalId, platform: "android" },
      { logicalAssetId: adminLogicalId, platform: "ios" },
    ]);
  });
});
