import { describe, expect, it } from "vitest";
import { findBestFile, getThemeFileSourceName } from "@/components/preview/previewResourceUtils";
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
