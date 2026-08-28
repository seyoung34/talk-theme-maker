import { describe, expect, it } from "vitest";
import { createAdminAssetSaveTargets, createAdminAssetWorkspaceSlots, formatAdminAssetScope, formatAdminAssetTargets, formatAdminAssetTargetsFromInputs, getAdminAssetCandidateMatchRank, getAdminAssetSlotLabel, getAdminAssetWorkspaceSlotVariant, selectAdminAssetTargetMatch } from "@/lib/theme/adminAssetWorkspace";
import type { AdminAssetCandidate } from "@/lib/theme/adminAssetDomain";
import { getThemeSlots, type ThemeAssetSlot } from "@/lib/theme/templates";

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
        { platform: "android", targetKind: "asset_kind", priority: 7, enabled: true },
      ],
    });

    expect(selectAdminAssetTargetMatch(slot!, multi, "android")).toMatchObject({ rank: 0, target: { priority: 1 } });
    expect(selectAdminAssetTargetMatch(slot!, generic, "android")).toMatchObject({ rank: 1, target: { priority: 7 } });
    // iOS에서는 android 전용 target이 빠져 남은 하나가 근거가 된다.
    expect(selectAdminAssetTargetMatch(slot!, generic, "ios")).toMatchObject({ rank: 1, target: { priority: 3 } });
  });

  it("targets가 비어 있고 부모 컬럼도 없으면 어떤 근거도 만들지 않는다", () => {
    const [slot] = createAdminAssetWorkspaceSlots({ android: [androidIcon], ios: [] });

    expect(selectAdminAssetTargetMatch(slot!, { assetKind: "icon", enabled: true, targets: [] }, "android")).toBeUndefined();
  });
});

/**
 * 적용 범위 문구는 카드·저장 확인 다이얼로그·사이드바가 함께 쓴다. 예전에는 컴포넌트 파일에
 * 있어 테스트가 없었고, 같은 에셋이 화면마다 다르게 읽힐 여지가 있었다.
 */
describe("적용 범위 문구", () => {
  const slots = getThemeSlots("android");

  it("kind 전체 target은 분류 이름으로 읽힌다", () => {
    expect(formatAdminAssetTargetsFromInputs([{ platform: "all", targetKind: "asset_kind" }], slots, "background"))
      .toBe("Android+iOS · 배경 이미지 전체");
  });

  it("슬롯 지정 target은 슬롯 라벨로 읽힌다", () => {
    expect(formatAdminAssetTargetsFromInputs([{ platform: "android", slotRole: "main_background", targetKind: "exact_role" }], slots))
      .toBe("Android · 메인 배경 이미지");
  });

  it("여러 target은 하나로 이어 붙인다", () => {
    const text = formatAdminAssetTargetsFromInputs(
      [
        { platform: "android", slotRole: "main_background", targetKind: "exact_role" },
        { platform: "all", targetKind: "asset_kind" },
      ],
      slots,
      "background",
    );

    expect(text).toBe("Android · 메인 배경 이미지 / Android+iOS · 배경 이미지 전체");
  });

  it("target이 없으면 부모 컬럼으로 읽는다", () => {
    expect(formatAdminAssetTargets({ platform: "ios", slotRole: "theme_icon", assetKind: "icon", targets: [] }, slots))
      .toBe("iOS · 테마 대표 아이콘");
  });

  /** 슬롯을 못 찾아도 빈칸 대신 role을 보여 준다. */
  it("모르는 role은 문자열 그대로 보여 준다", () => {
    expect(getAdminAssetSlotLabel("no_such_role", slots)).toBe("no_such_role");
  });

  it("슬롯이 넷 이상이면 앞 둘만 적고 나머지는 수로 줄인다", () => {
    const many = slots.filter((slot) => slot.role.startsWith("tab_icon_")).slice(0, 5);

    expect(formatAdminAssetScope(many)).toMatch(/외 \d+개$/);
    expect(formatAdminAssetScope([])).toBe("적용 슬롯 없음");
  });
});

/** 등록 경로마다 다른 범위가 나오면 같은 화면에서 등록한 에셋이 서로 다르게 적용된다. */
describe("createAdminAssetSaveTargets", () => {
  it("어떤 경로로 저장하든 kind 전체 target 하나만 만든다", () => {
    expect(createAdminAssetSaveTargets()).toEqual([{ platform: "all", targetKind: "asset_kind", priority: 0, enabled: true }]);
  });
});
