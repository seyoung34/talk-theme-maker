import { describe, expect, it } from "vitest";
import { getUploadAssetKind, inferLegacyThemeAssetKind, inferThemeAssetKind, type ThemeAssetKind } from "@/lib/theme/assetKind";
import { getThemeSlots } from "@/lib/theme/templates";
import { inferAdminAssetKind } from "@/lib/theme/adminAssetDomain";
import type { ThemePlatform } from "@/lib/theme/types";

const platforms: ThemePlatform[] = ["android", "ios"];
const allKinds: ThemeAssetKind[] = ["background", "icon", "bubble", "profile", "launcher", "passcode", "passcode_indicator"];

/**
 * 검사 순서가 규칙의 일부다.
 *
 * 아래로 갈수록 조건이 넓어서, 순서를 바꾸면 조용히 분류가 달라진다. 특히 잠금화면 표시(작은
 * 아이콘)와 잠금화면 배경(3:4 전체 이미지)은 모양도 용도도 다른데 이름이 겹친다.
 */
describe("inferThemeAssetKind 검사 순서", () => {
  it("잠금화면 표시를 잠금화면 배경보다 먼저 가른다", () => {
    const indicator = { role: "passcode_indicator_1", group: "keypad", section: "passcode", kind: "image" } as const;
    expect(inferThemeAssetKind(indicator)).toBe("passcode_indicator");
  });

  it("잠금화면 배경은 배경이 아니라 잠금화면이다", () => {
    // `background` 그룹이지만 `passcode_` 검사가 먼저라 passcode로 떨어진다.
    const background = { role: "passcode_background", group: "background", section: "passcode", kind: "image" } as const;
    expect(inferThemeAssetKind(background)).toBe("passcode");
  });

  it("탭 배경 이미지는 그룹과 무관하게 배경이다", () => {
    const tabBackground = { role: "tab_background_image", group: "bar", section: "tabs", kind: "image" } as const;
    expect(inferThemeAssetKind(tabBackground)).toBe("background");
  });

  it("말풍선은 말풍선이다", () => {
    const bubble = { role: "bubble_me_1", group: "bubbles", section: "chatroom", kind: "ninepatch" } as const;
    expect(inferThemeAssetKind(bubble)).toBe("bubble");
  });
});

/**
 * 사용자 업로드 공유의 대상 판정.
 *
 * `ThemeResourceRole`에는 색상 role이 수십 개 들어 있다. role만 보고 분류하면 색상 슬롯까지
 * 공유 대상으로 끌려 들어온다. 업로드 가능 여부는 role이 아니라 `slot.kind`가 정한다.
 */
describe("getUploadAssetKind", () => {
  it("색상 슬롯은 종류가 없다", () => {
    const color = { role: "chat_background_color", group: "background", section: "chatroom", kind: "color" } as const;
    expect(getUploadAssetKind(color)).toBeUndefined();
  });

  it("이미지 슬롯은 종류를 갖는다", () => {
    const image = { role: "chat_background", group: "background", section: "chatroom", kind: "image" } as const;
    expect(getUploadAssetKind(image)).toBe("background");
  });

  it("나인패치 슬롯도 종류를 갖는다", () => {
    const ninepatch = { role: "bubble_you_2", group: "bubbles", section: "chatroom", kind: "ninepatch" } as const;
    expect(getUploadAssetKind(ninepatch)).toBe("bubble");
  });
});

/**
 * 실제 manifest를 순회한다.
 *
 * role 문자열 목록을 손으로 적어 두면 새 슬롯이 생겨도 테스트가 통과한다. 슬롯 목록을 돌아야
 * 분류가 빠진 슬롯이 드러난다.
 */
describe("manifest 전수 검사", () => {
  for (const platform of platforms) {
    it(`${platform}의 업로드 가능한 슬롯이 모두 종류를 갖는다`, () => {
      const uploadable = getThemeSlots(platform).filter((slot) => slot.kind !== "color");
      expect(uploadable.length).toBeGreaterThan(0);

      const missing = uploadable.filter((slot) => !getUploadAssetKind(slot));
      expect(missing.map((slot) => slot.role)).toEqual([]);
    });

    it(`${platform}의 색상 슬롯은 모두 종류가 없다`, () => {
      const colors = getThemeSlots(platform).filter((slot) => slot.kind === "color");
      const classified = colors.filter((slot) => getUploadAssetKind(slot));
      expect(classified.map((slot) => slot.role)).toEqual([]);
    });

    it(`${platform}의 분류 결과가 정의된 종류 안에 있다`, () => {
      const kinds = new Set(getThemeSlots(platform).filter((slot) => slot.kind !== "color").map((slot) => getUploadAssetKind(slot)));
      for (const kind of kinds) {
        expect(allKinds).toContain(kind);
      }
    });
  }
});

/**
 * 추출 전후로 관리자 분류가 달라지면 안 된다. 같은 이미지가 관리자 목록과 사용자 목록에서
 * 다른 종류로 보이는 순간 이 작업의 목적이 무너진다.
 */
describe("관리자 분류와 같은 함수", () => {
  it("inferAdminAssetKind가 inferThemeAssetKind와 같은 결과를 낸다", () => {
    for (const platform of platforms) {
      for (const slot of getThemeSlots(platform)) {
        expect(inferAdminAssetKind(slot)).toBe(inferThemeAssetKind(slot));
      }
    }
  });
});

describe("inferLegacyThemeAssetKind", () => {
  it("슬롯이 없으면 기본값이 배경이다", () => {
    // 슬롯을 못 찾은 옛 레코드용이라 group을 볼 수 없다. 기본값이 다른 것이 의도다.
    expect(inferLegacyThemeAssetKind("chat_background")).toBe("background");
  });

  it("잠금화면 표시 우선순위는 여기서도 같다", () => {
    expect(inferLegacyThemeAssetKind("passcode_indicator_1")).toBe("passcode_indicator");
    expect(inferLegacyThemeAssetKind("passcode_background")).toBe("passcode");
  });
});
