import { describe, expect, it } from "vitest";
import { getThemeFileSourceName } from "@/components/preview/previewResourceUtils";
import type { ThemeProjectFile } from "@/lib/theme/project/types";

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
