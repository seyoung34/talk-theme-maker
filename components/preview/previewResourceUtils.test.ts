import { describe, expect, it } from "vitest";
import { findBestFile, getThemeFileSourceName, themeFileCacheKey } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";

function projectFile(overrides: Partial<ThemeProjectFile> = {}): ThemeProjectFile {
  return {
    path: "Images/bubble.png",
    name: "target-bubble.9.png",
    size: 0,
    ...overrides,
  };
}

describe("getThemeFileSourceName", () => {
  it("업로드 File 이름을 target 파일명보다 우선한다", () => {
    const file = new File(["plain"], "plain-upload.png", { type: "image/png" });
    expect(getThemeFileSourceName(projectFile({ file }))).toBe("plain-upload.png");
  });

  it("remote source URL을 target 파일명보다 우선한다", () => {
    const sourceUrl = "https://storage.test/android-bubble.9.png?token=secret";
    expect(getThemeFileSourceName(projectFile({ sourceUrl }))).toBe(sourceUrl);
  });

  it("source metadata가 없을 때만 target 파일명으로 되돌린다", () => {
    expect(getThemeFileSourceName(projectFile())).toBe("target-bubble.9.png");
  });
});

describe("findBestFile", () => {
  function analysis(file: ThemeProjectFile): ThemeProjectAnalysis {
    return {
      files: [file],
      resources: [{ id: "r", slotId: "s", platform: "android", role: "tab_icon_now", screen: "main", filePath: file.path }],
      screens: ["main"],
    } as unknown as ThemeProjectAnalysis;
  }

  /**
   * catalog 참조로 저장된 슬롯은 바이트를 내려받지 않는 것이 목적이라 `file`이 없고, 업로드를
   * 고른 상태라 `sourceUrl`도 없다. 남는 것은 서명된 `previewUrl` 하나뿐이다. 후보에서 걸러
   * 내면 화면에 빈 자리가 남는다 — 실제로 시스템 템플릿을 catalog 참조로 바꾼 뒤 탭 아이콘이
   * 전부 비었다.
   */
  it("previewUrl만 있는 파일도 후보로 인정한다", () => {
    const file = projectFile({ path: "res/tab.png", previewUrl: "https://signed.test/tab.png" });

    expect(findBestFile(analysis(file), "tab_icon_now")).toBe(file);
  });

  it("바이트도 URL도 없으면 후보에서 제외한다", () => {
    const file = projectFile({ path: "res/tab.png" });

    expect(findBestFile(analysis(file), "tab_icon_now")).toBeUndefined();
  });
});

/**
 * catalog 참조로만 저장된 항목은 `file`도 `sourceUrl`도 없고 `size`가 0이다. 키가 `previewUrl`을
 * 보지 않으면 같은 슬롯의 서로 다른 이미지가 통째로 같은 키가 되어, 이미지를 바꿔도 캐시가
 * 이전 이미지의 결과를 계속 내준다.
 */
describe("themeFileCacheKey", () => {
  const catalogOnly = (previewUrl: string) => projectFile({ path: "res/chat_bg.png", previewUrl });

  it("previewUrl만 다른 두 이미지를 구분한다", () => {
    expect(themeFileCacheKey(catalogOnly("https://cdn.test/a.webp")))
      .not.toBe(themeFileCacheKey(catalogOnly("https://cdn.test/b.webp")));
  });

  it("서명이 재발급돼도(쿼리만 변경) 같은 키를 유지한다", () => {
    expect(themeFileCacheKey(catalogOnly("https://signed.test/a.webp?token=1")))
      .toBe(themeFileCacheKey(catalogOnly("https://signed.test/a.webp?token=2")));
  });

  /**
   * 소비처마다 읽는 순서가 다르다 — 그리기와 말풍선 파싱은 previewUrl을 먼저 읽고, 팔레트
   * 추출은 원본을 먼저 읽는다. 키가 한쪽 우선순위만 따르면 다른 쪽에서 어긋난다. 그래서
   * 후보 주소를 전부 담고, 이 테스트가 두 소비처의 입력이 달라질 때 키도 달라지는지 본다.
   */
  describe("소비처가 읽는 주소가 달라지면 키도 달라진다", () => {
    const readForRender = (file: ThemeProjectFile) => file.previewUrl ?? file.sourceUrl;
    const readForPalette = (file: ThemeProjectFile) => file.sourceUrl ?? file.previewUrl;

    const pairs: [string, ThemeProjectFile, ThemeProjectFile][] = [
      [
        "원본이 같고 미리보기만 다르다",
        projectFile({ path: "res/chat_bg.png", sourceUrl: "https://storage.test/a.png", previewUrl: "https://cdn.test/a.webp" }),
        projectFile({ path: "res/chat_bg.png", sourceUrl: "https://storage.test/a.png", previewUrl: "https://cdn.test/b.webp" }),
      ],
      [
        "미리보기가 같고 원본만 다르다",
        projectFile({ path: "res/chat_bg.png", sourceUrl: "https://storage.test/a.png", previewUrl: "https://cdn.test/a.webp" }),
        projectFile({ path: "res/chat_bg.png", sourceUrl: "https://storage.test/b.png", previewUrl: "https://cdn.test/a.webp" }),
      ],
    ];

    for (const [label, left, right] of pairs) {
      it(label, () => {
        // 최소한 한쪽 소비처는 실제로 다른 바이트를 읽는 상황이어야 이 단언에 의미가 있다.
        expect(readForRender(left) !== readForRender(right) || readForPalette(left) !== readForPalette(right)).toBe(true);
        expect(themeFileCacheKey(left)).not.toBe(themeFileCacheKey(right));
      });
    }
  });
});
