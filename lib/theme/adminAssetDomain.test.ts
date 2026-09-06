import { describe, expect, it } from "vitest";
import { createBubbleFamilyDesignSpec } from "@/lib/theme/bubbleBuilder";
import { canonicalAdminAssetToCandidate, createDefaultBubbleAdjustment, isValidBubbleBuilderTargets, legacyRoleFromKind, mapCanonicalAdminAssetRow, selectAdminAssetPlatformVariant } from "@/lib/theme/adminAssetDomain";
import { getThemeSlots } from "@/lib/theme/templates";

const markers = {
  top: { start: 10, end: 11 },
  left: { start: 10, end: 11 },
  right: { start: 10, end: 11 },
  bottom: { start: 10, end: 11 },
};

describe("canonical admin asset variants", () => {
  it("preserves platform files and an editable bubble recipe", () => {
    const recipe = createBubbleFamilyDesignSpec("me");
    const asset = mapCanonicalAdminAssetRow({
      id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0",
      slot_role: "bubble_me_1",
      platform: "all",
      asset_kind: "bubble",
      analysis: { width: 250, height: 230, shapes: ["ninepatch"] },
      title: "빌더 말풍선",
      note: null,
      tags: [],
      file_name: "theme_chatroom_bubble_me_01_image.9.png",
      mime_type: "image/png",
      storage_path: "admin-assets/a/android.png",
      enabled: true,
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T00:00:00.000Z",
      admin_asset_targets: [{ asset_id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0", platform: "all", slot_role: "bubble_me_1", target_kind: "exact_role", priority: 0, enabled: true }],
      admin_asset_bubble_specs: [{
        asset_id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0",
        android_markers: markers,
        ios_insets: { top: 12, right: 12, bottom: 12, left: 12 },
        ios_stretch: { x: 20, y: 20 },
        geometry: {
          android: { stretch: { x: 20, y: 20 }, contentInsets: { top: 12, right: 12, bottom: 12, left: 12 } },
          ios: { stretch: { x: 20, y: 20 }, contentInsets: { top: 12, right: 12, bottom: 12, left: 12 } },
        },
      }],
      admin_asset_variants: [
        { asset_id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0", platform: "android", storage_path: "admin-assets/a/android.png", file_name: "android.9.png", mime_type: "image/png", analysis: { shapes: ["ninepatch"] } },
        { asset_id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0", platform: "ios", storage_path: "admin-assets/a/ios.png", file_name: "ios.png", mime_type: "image/png", analysis: { shapes: ["transparent"] } },
      ],
      admin_asset_bubble_designs: [{
        asset_id: "9ad40a53-314b-49d9-93f2-2b28a69cbfb0",
        recipe,
        geometry_mode: "generated",
        admin_asset_bubble_decorations: [{ layer_id: "layer-1", storage_path: "admin-assets/a/layer-1.png", file_name: "cat.png", mime_type: "image/png" }],
      }],
    });
    const candidate = canonicalAdminAssetToCandidate(asset, "https://example.test/android", {
      "admin-assets/a/android.png": "https://example.test/android",
      "admin-assets/a/ios.png": "https://example.test/ios",
    });

    expect(selectAdminAssetPlatformVariant(candidate, "ios")).toMatchObject({ fileName: "ios.png", previewUrl: "https://example.test/ios" });
    expect(candidate.bubbleDesign).toMatchObject({ geometryMode: "generated", recipe: { familyId: recipe.familyId } });
    expect(candidate.bubbleDesign?.decorations).toEqual([{ layerId: "layer-1", storagePath: "admin-assets/a/layer-1.png", fileName: "cat.png", mimeType: "image/png" }]);
    expect(candidate.bubbleSpec?.geometry?.ios).toEqual({
      stretch: { x: 20, y: 20 },
      contentInsets: { top: 12, right: 12, bottom: 12, left: 12 },
    });
  });
});

describe("isValidBubbleBuilderTargets", () => {
  it("accepts a single asset_kind group target (편집기 좌우반전으로 슬롯 방향을 대체)", () => {
    expect(isValidBubbleBuilderTargets([{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }], "bubble_me_1")).toBe(true);
  });

  it("accepts an exact_role target matching the given slot", () => {
    expect(isValidBubbleBuilderTargets([{ platform: "all", slotRole: "bubble_me_1", targetKind: "exact_role", priority: 0, enabled: true }], "bubble_me_1")).toBe(true);
  });

  it("rejects an exact_role target for a different slot", () => {
    expect(isValidBubbleBuilderTargets([{ platform: "all", slotRole: "bubble_you_1", targetKind: "exact_role", priority: 0, enabled: true }], "bubble_me_1")).toBe(false);
  });

  it("rejects a group target mixed with other targets", () => {
    expect(
      isValidBubbleBuilderTargets(
        [
          { platform: "all", targetKind: "asset_kind", priority: 0, enabled: true },
          { platform: "all", slotRole: "bubble_me_1", targetKind: "exact_role", priority: 0, enabled: true },
        ],
        "bubble_me_1",
      ),
    ).toBe(false);
  });

  it("rejects an empty target list", () => {
    expect(isValidBubbleBuilderTargets([], "bubble_me_1")).toBe(false);
  });

  it("rejects an exact_role target for another slot", () => {
    expect(isValidBubbleBuilderTargets([{ platform: "all", slotRole: "bubble_you_1", targetKind: "exact_role", priority: 0, enabled: true }], "bubble_me_1")).toBe(false);
  });
});

/**
 * `admin_assets.slot_role`은 `NOT NULL`이라 값을 계속 써야 하지만, 라우팅·매칭의 근거는
 * `admin_asset_targets`다. 저장 경로가 슬롯 목록의 첫 항목을 쓰면 manifest에 슬롯이
 * 추가·재정렬될 때 같은 kind의 저장값이 조용히 바뀐다. kind마다 고정된 값이어야 한다.
 */
describe("legacyRoleFromKind", () => {
  it("kind마다 슬롯 목록 순서와 무관한 고정 role을 준다", () => {
    expect(legacyRoleFromKind("background")).toBe("main_background");
    expect(legacyRoleFromKind("bubble")).toBe("bubble_me_1");
    expect(legacyRoleFromKind("profile")).toBe("profile_image_1");
    expect(legacyRoleFromKind("launcher")).toBe("launcher_foreground");
    expect(legacyRoleFromKind("passcode")).toBe("passcode_background");
    expect(legacyRoleFromKind("icon")).toBe("theme_icon");
  });

  it("kind를 모르면 아이콘으로 떨어진다", () => {
    expect(legacyRoleFromKind(undefined)).toBe("theme_icon");
  });

  /** 여기서 나온 role은 실제 슬롯이어야 한다. 아니면 카드 라벨이 role 문자열로 노출된다. */
  it("돌려주는 role은 실제 이미지 슬롯이다", () => {
    const imageRoles = new Set(
      (["android", "ios"] as const).flatMap((platform) =>
        getThemeSlots(platform).filter((slot) => slot.kind !== "color").map((slot) => slot.role),
      ),
    );
    for (const kind of ["background", "icon", "bubble", "profile", "launcher", "passcode"] as const) {
      expect(imageRoles.has(legacyRoleFromKind(kind))).toBe(true);
    }
  });
});

/**
 * 분석 필드가 크기만 남은 뒤에도 말풍선 기본 조정값이 그대로여야 한다.
 * 이 값이 바뀌면 새로 등록한 모든 말풍선의 초기 늘어남 구간이 달라진다.
 */
describe("createDefaultBubbleAdjustment", () => {
  it("원본 크기를 모르면 60x42로 가정한다", () => {
    expect(createDefaultBubbleAdjustment()).toEqual(createDefaultBubbleAdjustment({ width: 60, height: 42 }));
  });

  // 가운데 42~58%를 늘어나는 구간으로 잡는다. `floor`라 58%는 57px가 된다(부동소수점).
  it("크기에서 마커·inset·stretch를 계산한다", () => {
    expect(createDefaultBubbleAdjustment({ width: 100, height: 50 })).toEqual({
      markers: {
        top: { start: 42, end: 57 },
        left: { start: 21, end: 28 },
        right: { start: 21, end: 28 },
        bottom: { start: 42, end: 57 },
      },
      insets: { top: 14, right: 28, bottom: 14, left: 28 },
      stretch: { x: 50, y: 25 },
    });
  });

  /** 0이나 음수가 나오면 마커가 뒤집혀 미리보기가 깨진다. */
  it("아주 작은 이미지에서도 모든 값이 1 이상이고 end가 start보다 크다", () => {
    const { markers, insets, stretch } = createDefaultBubbleAdjustment({ width: 1, height: 1 });

    for (const range of Object.values(markers!)) {
      expect(range.start).toBeGreaterThanOrEqual(1);
      expect(range.end).toBeGreaterThan(range.start);
    }
    for (const value of Object.values(insets!)) expect(value).toBeGreaterThanOrEqual(1);
    expect(stretch!.x).toBeGreaterThanOrEqual(1);
    expect(stretch!.y).toBeGreaterThanOrEqual(1);
  });

  it("크기를 모르는 분석 결과는 기본값과 같다", () => {
    expect(createDefaultBubbleAdjustment({})).toEqual(createDefaultBubbleAdjustment(null));
  });
});
