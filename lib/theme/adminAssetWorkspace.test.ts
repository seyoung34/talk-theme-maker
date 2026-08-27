import { describe, expect, it } from "vitest";
import { createAdminAssetWorkspaceSlots, getAdminAssetCandidateMatchRank, getAdminAssetWorkspaceSlotVariant, selectAdminAssetTargetMatch } from "@/lib/theme/adminAssetWorkspace";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

const androidIcon = {
  id: "android-theme-icon",
  platform: "android",
  role: "theme_icon",
  section: "common",
  group: "icons",
  screen: "friends",
  kind: "image",
  label: "테마 아이콘",
  required: false,
  note: "",
  fileName: "icon.png",
} as const satisfies ThemeAssetSlot;

const iosIcon = {
  ...androidIcon,
  id: "ios-theme-icon",
  platform: "ios",
  fileName: "commonIcoTheme.png",
} as const satisfies ThemeAssetSlot;

function asset(overrides: Partial<AdminAssetCandidate> = {}): AdminAssetCandidate {
  return {
    id: "asset-1",
    slotRole: "theme_icon",
    platform: "all",
    assetKind: "icon",
    title: "아이콘",
    tags: [],
    fileName: "icon.png",
    mimeType: "image/png",
    storagePath: "admin-assets/asset-1/icon.png",
    createdAt: 0,
    updatedAt: 0,
    enabled: true,
    ...overrides,
  };
}

describe("admin asset workspace slots", () => {
  it("merges the same role while preserving both platform variants", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [iosIcon] });

    expect(slot).toMatchObject({ key: "theme_icon", role: "theme_icon", kind: "icon" });
    expect(slot?.variants.android?.fileName).toBe("icon.png");
    expect(slot?.variants.ios?.fileName).toBe("commonIcoTheme.png");
    expect(getAdminAssetWorkspaceSlotVariant(slot!, "ios")?.id).toBe("ios-theme-icon");
  });

  it("ranks exact targets before compatible and generic targets", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [iosIcon] });
    const exact = asset({ targets: [{ platform: "all", slotRole: "theme_icon", targetKind: "exact_role", priority: 0, enabled: true }] });
    const generic = asset({ targets: [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }] });

    expect(getAdminAssetCandidateMatchRank(slot!, exact, "android")).toBe(0);
    expect(getAdminAssetCandidateMatchRank(slot!, generic, "ios")).toBe(1);
  });

  it("does not expose a bubble candidate targeted to another exact bubble role", () => {
    const bubble = { ...androidIcon, id: "android-bubble-me-1", role: "bubble_me_1", group: "bubbles", section: "chatroom", label: "내 말풍선 1", kind: "ninepatch" } as const satisfies ThemeAssetSlot;
    const [slot] = createAdminAssetWorkspaceSlots({ android: [bubble], ios: [] });
    const candidate = asset({ assetKind: "bubble", slotRole: "bubble_you_1", targets: [{ platform: "all", slotRole: "bubble_you_1", targetKind: "exact_role", priority: 0, enabled: true }] });

    expect(getAdminAssetCandidateMatchRank(slot!, candidate, "android")).toBeUndefined();
  });

  it("슬롯을 지정하지 않으면 exact target은 근거가 되지 못한다", () => {
    const exact = asset({ targets: [{ platform: "all", slotRole: "theme_icon", targetKind: "exact_role", priority: 0, enabled: true }] });
    const generic = asset({ targets: [{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }] });

    expect(getAdminAssetCandidateMatchRank({ kind: "icon" }, exact, "android")).toBeUndefined();
    expect(getAdminAssetCandidateMatchRank({ kind: "icon" }, generic, "android")).toBe(1);
  });

  // `validateTarget`이 막는 형태다. 어느 슬롯을 뜻하는지 알 수 없으므로 근거로 쓰지 않는다.
  it("exact_role이 아닌데 slotRole이 박힌 target은 무시한다", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [] });
    const malformed = asset({ targets: [{ platform: "all", slotRole: "theme_icon", targetKind: "asset_kind", priority: 0, enabled: true }] });

    expect(getAdminAssetCandidateMatchRank(slot!, malformed, "android")).toBeUndefined();
  });

  it("여러 target이 맞으면 순위가 낮고 우선순위가 높은 target을 근거로 고른다", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [] });
    const multi = asset({
      targets: [
        { platform: "all", targetKind: "asset_kind", priority: 9, enabled: true },
        { platform: "all", slotRole: "theme_icon", targetKind: "exact_role", priority: 1, enabled: true },
      ],
    });
    const generic = asset({
      targets: [
        { platform: "all", targetKind: "asset_kind", priority: 3, enabled: true },
        { platform: "all", targetKind: "shape_rule", priority: 7, enabled: true },
      ],
    });

    expect(selectAdminAssetTargetMatch(slot!, multi, "android")).toMatchObject({ rank: 0, target: { priority: 1 } });
    expect(selectAdminAssetTargetMatch(slot!, generic, "android")).toMatchObject({ rank: 1, target: { priority: 3 } });
  });

  it("targets가 비어 있고 부모 컬럼도 없으면 어떤 근거도 만들지 않는다", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [] });

    expect(selectAdminAssetTargetMatch(slot!, { assetKind: "icon", enabled: true, targets: [] }, "android")).toBeUndefined();
  });
});
