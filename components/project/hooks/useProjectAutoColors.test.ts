import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { shouldReleaseAutoBackgroundLink, useProjectAutoColors } from "@/components/project/hooks/useProjectAutoColors";
import { autoMainPaletteCandidateId, getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import type { ThemeProjectAnalysis, ThemeProjectFile } from "@/lib/theme/project/types";
import type { ThemePlatform } from "@/lib/theme/types";

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

describe("shouldReleaseAutoBackgroundLink", () => {
  const base = { hasImage: false, hadImage: true, isAuto: true };

  it("이미지를 지운 순간에만 연동을 끊는다", () => {
    expect(shouldReleaseAutoBackgroundLink(base)).toBe(true);
  });

  /**
   * 이 한 줄이 이번 수정의 전부다. 기본 템플릿에는 배경 이미지가 없어서 "이미지가 없다"만 보면
   * 편집기를 여는 즉시 조건이 성립하고, 아직 아무것도 안 한 사용자의 배경색 연동이 먼저 끊겼다.
   */
  it("처음부터 이미지가 없었던 경우는 끊지 않는다", () => {
    expect(shouldReleaseAutoBackgroundLink({ ...base, hadImage: false })).toBe(false);
  });

  it("이미지가 있으면 끊지 않는다", () => {
    expect(shouldReleaseAutoBackgroundLink({ ...base, hasImage: true })).toBe(false);
    expect(shouldReleaseAutoBackgroundLink({ hasImage: true, hadImage: false, isAuto: true })).toBe(false);
  });

  it("이미 직접 지정한 슬롯은 건드리지 않는다", () => {
    // 끊을 연동이 없는데 색을 덮어쓰면 사용자가 고른 값이 사라진다.
    expect(shouldReleaseAutoBackgroundLink({ ...base, isAuto: false })).toBe(false);
  });
});

/**
 * 편집기는 자동 연동된 상태로 열린다. 이 전제가 깨지면 위 판정을 고쳐도 소용이 없다 —
 * 배경을 올렸을 때 이 슬롯만 대상에는 들어가고 연동에서는 빠져 벌크 버튼이 켜진다.
 */
describe("편집기 첫 상태", () => {
  const platforms: ThemePlatform[] = ["android", "ios"];

  for (const platform of platforms) {
    it(`${platform}의 메인 배경색은 자동 연동으로 시작한다`, () => {
      const slots = getThemeSlots(platform);
      const selections = getInitialSlotCandidateSelections(slots, "basic", getThemeTemplate("basic"));
      const mainBackgroundColor = slots.find((slot) => slot.role === "main_background_color")!;

      expect(selections[mainBackgroundColor.id]).toBe(autoMainPaletteCandidateId);
    });

    it(`${platform}의 기본 템플릿에는 배경 이미지가 없다`, () => {
      // 없기 때문에 "이미지가 없다"만으로 판정하면 첫 진입에서 바로 걸린다. 나중에 기본
      // 이미지가 생기면 이 테스트가 깨지면서 위 판정을 다시 볼 이유가 생긴다.
      const mainBackground = getThemeSlots(platform).find((slot) => slot.role === "main_background")!;

      expect(mainBackground.defaultAssetUrls?.basic).toBeUndefined();
    });
  }
});
