import { describe, expect, it } from "vitest";
import { getCandidateCardWidthClass, getCandidateLayoutKind, getMobileCandidatePageCount, getMobileCandidatePageIndex, mobileCandidatePageSize } from "@/components/project/candidateLayout";
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

describe("getCandidateCardWidthClass", () => {
  it("보기 모드와 무관하게 사용할 고정 카드 폭을 제공한다", () => {
    expect(getCandidateCardWidthClass("wallpaper")).toBe("w-[88px] shrink-0");
    expect(getCandidateCardWidthClass("color")).toBe("w-[92px] shrink-0");
    expect(getCandidateCardWidthClass("image")).toBe("w-[96px] shrink-0");
  });
});

describe("모바일 후보 페이지", () => {
  it("4×4 한 페이지에 후보 타일을 16개씩 배치한다", () => {
    expect(mobileCandidatePageSize).toBe(16);
    expect(getMobileCandidatePageCount(0)).toBe(1);
    expect(getMobileCandidatePageCount(16)).toBe(1);
    expect(getMobileCandidatePageCount(17)).toBe(2);
    expect(getMobileCandidatePageCount(33)).toBe(3);
  });

  it("선택한 후보가 포함된 페이지를 계산한다", () => {
    expect(getMobileCandidatePageIndex(-1)).toBe(0);
    expect(getMobileCandidatePageIndex(0)).toBe(0);
    expect(getMobileCandidatePageIndex(15)).toBe(0);
    expect(getMobileCandidatePageIndex(16)).toBe(1);
    expect(getMobileCandidatePageIndex(32)).toBe(2);
  });
});
