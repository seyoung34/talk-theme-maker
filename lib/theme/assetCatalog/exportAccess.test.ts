import { describe, expect, it } from "vitest";
import {
  isAdminAssetAllowedForExport,
  isCatalogExportResourceRole,
  isCatalogAssetAllowedForExport,
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
    ["wrong platform target", { admin_asset_targets: [{ asset_id: assetId, platform: "ios", slot_role: "main_background", target_kind: "exact_role", priority: 0, enabled: true }] }],
    ["disabled target", { admin_asset_targets: [{ asset_id: assetId, platform: "android", slot_role: "main_background", target_kind: "exact_role", priority: 0, enabled: false }] }],
  ])("%s 에셋은 export에서 차단한다", (_label, overrides) => {
    expect(isAdminAssetAllowedForExport({ asset: access(overrides), platform: "android", resourceRole: "main_background" })).toBe(false);
  });

  // target이 아직 없는 옛 행은 부모 컬럼이 유일한 근거라 그대로 플랫폼 경계가 된다.
  it("child target이 없는 legacy 행은 부모 platform으로 차단한다", () => {
    const legacy = access({ platform: "ios", admin_asset_targets: [] });
    expect(isAdminAssetAllowedForExport({ asset: legacy, platform: "android", resourceRole: "main_background" })).toBe(false);
    expect(isAdminAssetAllowedForExport({ asset: legacy, platform: "ios", resourceRole: "main_background" })).toBe(true);
  });

  /**
   * 대표 target(`selectRepresentativeTarget`)은 `exact_role`을 먼저 고르므로 `asset.platform`이
   * android로 좁혀진다. 그 값으로 플랫폼을 판정하면 `asset_kind(all)` target이 허용하는 iOS
   * 내보내기가 막힌다 — 피커는 같은 자산을 iOS에서 보여 주므로 그대로 두면 403이 된다.
   */
  it("exact_role(android)과 asset_kind(all)을 함께 가진 에셋은 iOS에서도 허용한다", () => {
    const shared = mapAdminAssetExportAccessRow({
      id: assetId,
      slot_role: "main_background",
      platform: "android",
      asset_kind: "background",
      enabled: true,
      admin_asset_targets: [
        { asset_id: assetId, platform: "android", slot_role: "main_background", target_kind: "exact_role", priority: 0, enabled: true },
        { asset_id: assetId, platform: "all", slot_role: null, target_kind: "asset_kind", priority: 0, enabled: true },
      ],
    });
    expect(isAdminAssetAllowedForExport({ asset: shared, platform: "ios", resourceRole: "main_background" })).toBe(true);
  });

  /**
   * `inferLegacyAssetKind`는 `group`을 못 봐서 이 role들을 배경으로 분류하지만, 피커가 쓰는
   * `inferThemeAssetKind(slot)`은 아이콘으로 본다. 게이트가 옛 추정을 쓰면 피커에서 고를 수 있는
   * 아이콘이 내보내기에서 403이 된다.
   */
  it.each([
    ["splash", "android"],
    ["find_add_friend", "android"],
    ["find_add_friend", "ios"],
  ] as const)("%s(%s) 슬롯은 슬롯 정의 기준 kind로 판정한다", (resourceRole, platform) => {
    const icon = mapAdminAssetExportAccessRow({
      id: assetId,
      slot_role: "theme_icon",
      platform: "all",
      asset_kind: "icon",
      enabled: true,
      admin_asset_targets: [{ asset_id: assetId, platform: "all", slot_role: null, target_kind: "asset_kind", priority: 0, enabled: true }],
    });
    expect(isAdminAssetAllowedForExport({ asset: icon, platform, resourceRole })).toBe(true);
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
        upload_refs: { "android-bubble-me-1": [{ id: uploadEntryId, fileName: "bubble.png" }] },
        system_template_bundles: { status: "published", visibility: "public", created_by: "owner-a" },
      },
    ], { uploadEntryIds: [uploadEntryId], userId: "other-user" })).toEqual([
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "android", resourceRoles: ["bubble_me_1"] },
    ]);
  });

  it("private/draft 템플릿은 bundle 소유자에게만 export 접근을 준다", () => {
    const uploadEntryId = "ios-bubble-me-1:upload:1";
    const row = {
      platform: "ios",
      upload_refs: { "ios-bubble-me-1": [{ id: uploadEntryId }] },
      system_template_bundles: { status: "draft", visibility: "private", created_by: "owner-a" },
    };
    expect(mapTemplateAssetExportAccessRows([row], { uploadEntryIds: [uploadEntryId], userId: "other-user" })).toEqual([]);
    expect(mapTemplateAssetExportAccessRows([row], { uploadEntryIds: [uploadEntryId], userId: "owner-a" })).toEqual([
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "ios", resourceRoles: ["bubble_me_1"] },
    ]);
  });

  it("서로 다른 플랫폼 variant의 같은 upload id를 각각 기록한다", () => {
    const uploadEntryId = "shared:upload:1";
    expect(mapTemplateAssetExportAccessRows([
      { platform: "android", upload_refs: { "android-bubble-me-1": [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
      { platform: "ios", upload_refs: { "ios-bubble-me-1": [{ id: uploadEntryId }] }, system_template_bundles: { status: "published", visibility: "public" } },
    ], { uploadEntryIds: [uploadEntryId] })).toEqual([
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "android", resourceRoles: ["bubble_me_1"] },
      { logicalAssetId: `tpl:${uploadEntryId}`, platform: "ios", resourceRoles: ["bubble_me_1"] },
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

  // upload_refs의 키는 슬롯 id다. 플랫폼마다 id가 다르므로 함께 바꾼다.
  function templateRow(platform: "android" | "ios" = "android", overrides: Record<string, unknown> = {}) {
    const slotId = platform === "android" ? "android-main-background" : "ios-main-background-image";
    return {
      platform,
      upload_refs: {
        [slotId]: [{
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
    })).toEqual([{ logicalAssetId: adminLogicalId, platform: "android", resourceRoles: ["main_background"] }]);
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
      templateRow("android", { system_template_bundles: { status: "draft", visibility: "private", created_by: "owner-a" } }),
    ], { uploadEntryIds: [], catalogAssetIds: [adminLogicalId], userId: "other-user" })).toEqual([]);
  });

  it("같은 자산이 Android/iOS 템플릿에 함께 있으면 플랫폼별로 준다", () => {
    expect(mapTemplateAssetExportAccessRows([
      templateRow(),
      templateRow("ios"),
    ], { uploadEntryIds: [], catalogAssetIds: [adminLogicalId], userId: "u" })).toEqual([
      { logicalAssetId: adminLogicalId, platform: "android", resourceRoles: ["main_background"] },
      { logicalAssetId: adminLogicalId, platform: "ios", resourceRoles: ["main_background"] },
    ]);
  });
});

/**
 * 템플릿 멤버십이 관리자 ACL을 통째로 대체하면 권한 우회가 된다. 말풍선 전용으로 허용된
 * 에셋을 아는 클라이언트가 같은 플랫폼의 탭 바나 배경 슬롯에 넣어 내보낼 수 있기 때문이다.
 * 멤버십은 **그 템플릿에서 실제로 놓여 있던 자리**만 보증한다.
 */
describe("템플릿 멤버십의 role 경계", () => {
  const bubbleAccess = {
    kind: "template" as const,
    rolesByPlatform: { android: ["bubble_me_1"] as const },
  };

  function allows(resourceRole: string) {
    return isCatalogAssetAllowedForExport({
      access: bubbleAccess,
      platform: "android",
      resourceRole: resourceRole as never,
    });
  }

  it("놓여 있던 자리는 허용한다", () => {
    expect(allows("bubble_me_1")).toBe(true);
  });

  // 말풍선 4칸·전체 배경 3칸·탭 아이콘은 사용자 업로드를 공유한다. 여기서 막으면 정상 동작이 깨진다.
  it("같은 공유 그룹의 슬롯은 허용한다", () => {
    expect(allows("bubble_me_2")).toBe(true);
    expect(allows("bubble_you_1")).toBe(true);
  });

  it("다른 슬롯으로는 넘어가지 못한다", () => {
    expect(allows("main_background")).toBe(false);
    expect(allows("tab_icon_friends")).toBe(false);
    expect(allows("splash_image")).toBe(false);
  });

  // `profile_image_full_1`은 `profile_image_1`을, focused 탭 아이콘은 기본 아이콘을 상속한다.
  it("상속받는 슬롯은 원본 role의 보증으로 허용한다", () => {
    const profileAccess = { kind: "template" as const, rolesByPlatform: { android: ["profile_image_1"] as const } };
    expect(isCatalogAssetAllowedForExport({ access: profileAccess, platform: "android", resourceRole: "profile_image_full_1" })).toBe(true);
    expect(isCatalogAssetAllowedForExport({ access: profileAccess, platform: "android", resourceRole: "main_background" })).toBe(false);
  });

  it("다른 플랫폼에는 보증이 없다", () => {
    expect(isCatalogAssetAllowedForExport({ access: bubbleAccess, platform: "ios", resourceRole: "bubble_me_1" })).toBe(false);
  });
});
