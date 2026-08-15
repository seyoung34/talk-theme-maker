import { describe, expect, it } from "vitest";
import { findUnsignedPreviewAssets, generatePreviewScreens } from "@/lib/theme/systemTemplates/screenPreview";
import type { TemplatePreviewVisual } from "@/lib/theme/systemTemplates/preview";

const background = "system-templates/x/main-background.png";
const bubble = "system-templates/x/bubble-me-1.png";

/**
 * 미리보기를 굽지 **말아야** 하는 조건.
 *
 * 구운 화면은 업로드되는 순간 갤러리가 영구히 우선한다. 그래서 "일부만 있는 상태로 구우면"
 * 실제 테마와 다른 미리보기가 굳어 버린다 — 다시 구울 때까지 아무도 모른다.
 * 반대로 굽지 않으면 모달이 원본을 받아 그리는 폴백으로 떨어질 뿐이다. 느리지만 정확하다.
 * **의심스러우면 굽지 않는다**가 이 경로의 기본값이다.
 */
describe("findUnsignedPreviewAssets", () => {
  it("서명이 빠진 경로를 집어낸다", () => {
    expect(findUnsignedPreviewAssets([background, bubble], { [background]: "https://signed/bg" })).toEqual([bubble]);
  });

  it("전부 서명됐으면 비어 있다", () => {
    expect(findUnsignedPreviewAssets([background, bubble], { [background]: "a", [bubble]: "b" })).toEqual([]);
  });

  it("서명 결과가 통째로 비면 기대한 경로 전부를 돌려준다", () => {
    // 서명 호출이 실패해 빈 맵으로 떨어진 경우. 이대로 구우면 색만 남은 화면이 만들어진다.
    expect(findUnsignedPreviewAssets([background, bubble], {})).toEqual([background, bubble]);
  });

  it("기대한 경로가 없으면 막지 않는다", () => {
    // 업로드 에셋이 없는 템플릿은 색만으로 구워도 맞다.
    expect(findUnsignedPreviewAssets([], {})).toEqual([]);
  });

  it("빈 문자열이 들어와도 서명된 것으로 보지 않는다", () => {
    expect(findUnsignedPreviewAssets([background], { [background]: "" })).toEqual([background]);
  });
});

describe("generatePreviewScreens", () => {
  it("2D 컨텍스트를 쓸 수 없으면 굽지 않고 빈 결과를 준다", async () => {
    // happy-dom에는 canvas 2D가 없다. 이미지를 받기 전에 끝나야 하고, 던지면 안 된다 —
    // 던지면 저장과 일괄 재생성 전체가 멈춘다.
    await expect(generatePreviewScreens({} as TemplatePreviewVisual)).resolves.toEqual({});
  });
});
