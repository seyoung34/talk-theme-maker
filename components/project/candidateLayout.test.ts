import { describe, expect, it } from "vitest";
import { getCandidateLayoutKind } from "@/components/project/candidateLayout";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

function makeSlot(overrides: Partial<ThemeAssetSlot>): ThemeAssetSlot {
  return {
    id: "test-slot",
    platform: "android",
    role: "profile_image_1",
    section: "common",
    group: "profiles",
    screen: "profile",
    kind: "image",
    label: "테스트",
    required: false,
    note: "테스트 슬롯",
    ...overrides,
  };
}

describe("getCandidateLayoutKind", () => {
  it("색상 슬롯은 색상 레이아웃으로 분류한다", () => {
    expect(getCandidateLayoutKind(makeSlot({ kind: "color" }))).toBe("color");
  });

  it("세로 배경 역할은 크기 메타데이터가 없어도 배경 레이아웃으로 분류한다", () => {
    expect(getCandidateLayoutKind(makeSlot({ role: "chat_background" }))).toBe("wallpaper");
  });

  it("세로 비율 이미지도 배경 레이아웃으로 분류한다", () => {
    expect(getCandidateLayoutKind(makeSlot({
      constraints: { aspectRatio: { width: 9, height: 16 } },
    }))).toBe("wallpaper");
  });

  it("가로형 및 일반 이미지는 일반 이미지 레이아웃으로 분류한다", () => {
    expect(getCandidateLayoutKind(makeSlot({
      role: "tab_background_image",
      constraints: { recommendedSize: { width: 1442, height: 214 } },
    }))).toBe("image");
  });
});
