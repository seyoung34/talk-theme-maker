import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProjectAutoColors } from "@/components/project/hooks/useProjectAutoColors";
import { getThemeTemplate } from "@/lib/theme/templates";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";

const extractThemeImagePalette = vi.fn(async () => ({
  average: "#111111",
  top: "#222222",
  bottom: "#333333",
  accent: "#444444",
}));

vi.mock("@/lib/theme/colorPalette", async () => {
  const actual = await vi.importActual<typeof import("@/lib/theme/colorPalette")>("@/lib/theme/colorPalette");
  return {
    ...actual,
    extractThemeImagePalette: (file: ThemeProjectFile) => {
      void file;
      return extractThemeImagePalette();
    },
  };
});

/**
 * `analysis`는 매 렌더마다 새 객체로 다시 만들어질 수 있는 상위 상태다. 그 안의
 * `ThemeProjectFile` 래퍼도 매번 새로 생성되지만, 실제로 가리키는 이미지가 그대로면
 * (`path`/`sourceUrl`/`size` 같은 안정적인 key가 그대로면) 팔레트 추출을 다시 돌릴
 * 이유가 없다. 그 반대로 실제 소스가 바뀌면 다시 돌아야 한다.
 */
describe("useProjectAutoColors - 배경 이미지 팔레트 추출", () => {
  function buildAnalysis(file: ThemeProjectFile): ThemeProjectAnalysis {
    return {
      summary: {} as ThemeProjectAnalysis["summary"],
      files: [file],
      resources: [
        { id: "r1", platform: "android", role: "main_background", screen: "tabs", filePath: file.path },
      ],
      diagnostics: [],
    };
  }

  function renderWithAnalysis(analysis: ThemeProjectAnalysis) {
    const template = getThemeTemplate("basic");
    return renderHook(
      (props: { analysis: ThemeProjectAnalysis }) =>
        useProjectAutoColors({
          activeTemplate: template,
          analysis: props.analysis,
          candidateSelections: {},
          colors: {},
          platform: "android",
          setCandidateSelections: vi.fn(),
          setColors: vi.fn(),
          slots: [],
          templateId: "basic",
        }),
      { initialProps: { analysis } },
    );
  }

  it("같은 소스(path/size)를 가리키는 새 래퍼 객체로 리렌더되어도 추출을 다시 돌리지 않는다", async () => {
    extractThemeImagePalette.mockClear();
    const fileA = { path: "main_background/img.png", name: "img.png", size: 100, sourceUrl: "blob:a" };
    const analysis1 = buildAnalysis(fileA);
    const { rerender } = renderWithAnalysis(analysis1);

    await vi.waitFor(() => expect(extractThemeImagePalette).toHaveBeenCalledTimes(1));

    // 같은 값이지만 다른 객체 identity - 상위 analysis가 재계산되면서 흔히 생기는 상황.
    const fileB = { path: "main_background/img.png", name: "img.png", size: 100, sourceUrl: "blob:a" };
    const analysis2 = buildAnalysis(fileB);
    rerender({ analysis: analysis2 });

    // 마이크로태스크가 돌 시간을 준다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(extractThemeImagePalette).toHaveBeenCalledTimes(1);
  });

  it("실제 소스가 바뀌면(size 변경) 다시 추출한다", async () => {
    extractThemeImagePalette.mockClear();
    const fileA = { path: "main_background/img.png", name: "img.png", size: 100, sourceUrl: "blob:a" };
    const { rerender } = renderWithAnalysis(buildAnalysis(fileA));

    await vi.waitFor(() => expect(extractThemeImagePalette).toHaveBeenCalledTimes(1));

    const fileC = { path: "main_background/img.png", name: "img.png", size: 200, sourceUrl: "blob:b" };
    rerender({ analysis: buildAnalysis(fileC) });

    await vi.waitFor(() => expect(extractThemeImagePalette).toHaveBeenCalledTimes(2));
  });
});
