import { describe, expect, it } from "vitest";
import { createAdminAssetWorkspaceSlots, getAdminAssetCandidateMatchRank, getAdminAssetWorkspaceSlotVariant } from "@/lib/theme/adminAssetWorkspace";
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
});
