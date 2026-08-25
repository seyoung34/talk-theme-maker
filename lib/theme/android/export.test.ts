import { describe, expect, it } from "vitest";
import { canUseServerAssetReference, createAndroidImageCatalogTransform, getAndroidSlotExportPaths, resolveAndroidNinePatchMarkers, shouldDeriveAndroidLauncherRole } from "@/lib/theme/android/export";
import { bubbleGeometryToAndroidMarkers, flipAndroidMarkersHorizontally, flipBubbleGeometryHorizontally } from "@/lib/theme/bubbleGeometry";
import { androidThemeSlots, getThemeTemplate } from "@/lib/theme/templates";
import { getInitialSlotCandidateSelections } from "@/lib/theme/project/state";
import type { ThemeAssetSlot } from "@/lib/theme/templates";

/**
 * Android 내보내기 계약.
 *
 * 여기서 다루는 것은 **어떤 파일이 어떤 경로로 몇 개 나가는지**와 **저장된 편집값 중 무엇이
 * marker가 되는지**다. 내보낸 이미지의 실제 픽셀은 다루지 않는다 — happy-dom에는 2D 캔버스
 * 컨텍스트가 없어 `canvas.getContext("2d")`가 `null`이고, 나인패치 인코딩·리사이즈가 모두
 * 캔버스를 거친다. 픽셀 검증은 Playwright 몫이다(`e2e/AGENTS.md`).
 */

const imageSlots = androidThemeSlots.filter((slot) => slot.kind !== "color" && Boolean(slot.path));

function findSlot(id: string): ThemeAssetSlot {
  const slot = androidThemeSlots.find((candidate) => candidate.id === id);
  if (!slot) throw new Error(`슬롯을 찾지 못했습니다: ${id}`);
  return slot;
}

describe("Android 슬롯 출력 경로", () => {
  it("말풍선은 xxhdpi 나인패치 한 경로로만 나간다", () => {
    expect(getAndroidSlotExportPaths(findSlot("android-bubble-me-1"))).toEqual([
      "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_me_01_image.9.png",
    ]);
    expect(getAndroidSlotExportPaths(findSlot("android-bubble-you-2"))).toEqual([
      "src/main/theme/drawable-xxhdpi/theme_chatroom_bubble_you_02_image.9.png",
    ]);
  });

  it("scaleTargets가 자기 path를 포함해도 같은 경로를 두 번 내보내지 않는다", () => {
    // 매니페스트의 scaleTargets는 관례적으로 자기 path를 첫 항목으로 담는다. 중복을 제거하지 않으면
    // zip에 같은 이름의 엔트리가 두 개 생긴다.
    const slot = findSlot("android-main-background");
    expect(slot.export?.android?.scaleTargets).toContain(slot.path);
    expect(getAndroidSlotExportPaths(slot)).toEqual([
      "src/main/theme/drawable-xxhdpi/theme_background_image.png",
      "src/main/theme/drawable-sw600dp/theme_background_image.png",
    ]);
  });

  it("모든 이미지 슬롯이 최소 한 경로를 내보낸다", () => {
    const empty = imageSlots.filter((slot) => getAndroidSlotExportPaths(slot).length === 0);
    expect(empty.map((slot) => slot.id)).toEqual([]);
  });

  it("launcher family는 target과 서로 다른 density 경로를 사용한다", () => {
    expect(getAndroidSlotExportPaths(findSlot("android-launcher-background"))).toEqual([
      "src/main/res/mipmap-xxxhdpi/ic_launcher_background.png",
      "src/main/res/mipmap-mdpi/ic_launcher_background.png",
      "src/main/res/mipmap-hdpi/ic_launcher_background.png",
      "src/main/res/mipmap-xhdpi/ic_launcher_background.png",
      "src/main/res/mipmap-xxhdpi/ic_launcher_background.png",
    ]);
    expect(getAndroidSlotExportPaths(findSlot("android-launcher-icon"))).toEqual([
      "src/main/res/mipmap-xxxhdpi/ic_launcher.png",
      "src/main/res/mipmap-mdpi/ic_launcher.png",
      "src/main/res/mipmap-hdpi/ic_launcher.png",
      "src/main/res/mipmap-xhdpi/ic_launcher.png",
      "src/main/res/mipmap-xxhdpi/ic_launcher.png",
    ]);
  });

  it("서로 다른 슬롯이 같은 zip 경로를 차지하지 않는다", () => {
    // 두 슬롯이 같은 경로로 나가면 나중 것이 앞의 것을 덮는다. 사용자에게는 "편집한 슬롯이
    // 반영되지 않는" 증상으로만 보여서 추적이 어렵다.
    const ownerByPath = new Map<string, string>();
    const collisions: string[] = [];
    for (const slot of imageSlots) {
      for (const path of getAndroidSlotExportPaths(slot)) {
        const owner = ownerByPath.get(path);
        if (owner) collisions.push(`${path}: ${owner} / ${slot.id}`);
        else ownerByPath.set(path, slot.id);
      }
    }

    expect(collisions).toEqual([]);
  });

  it("색상 슬롯은 이미지 경로를 갖지 않는다", () => {
    const colorSlotsWithPath = androidThemeSlots.filter((slot) => slot.kind === "color" && slot.path);
    expect(colorSlotsWithPath.map((slot) => slot.id)).toEqual([]);
  });

  it("기본 템플릿은 기존 launcher artwork를 보존하고, background를 바꾼 경우에만 파생한다", () => {
    const template = getThemeTemplate("basic");
    const selections = getInitialSlotCandidateSelections(androidThemeSlots, "basic", template);
    const launcherIcon = findSlot("android-launcher-icon");
    const background = findSlot("android-launcher-background");

    expect(shouldDeriveAndroidLauncherRole(launcherIcon, {}, selections, "basic", template, androidThemeSlots)).toBe(false);

    const uploadedSelections = { ...selections, [background.id]: "uploaded-background" };
    const uploads = {
      [background.id]: [{ id: "uploaded-background", file: new File([new Uint8Array([1])], "background.png", { type: "image/png" }) }],
    };
    expect(shouldDeriveAndroidLauncherRole(launcherIcon, uploads, uploadedSelections, "basic", template, androidThemeSlots)).toBe(true);
    expect(shouldDeriveAndroidLauncherRole(findSlot("android-launcher-foreground"), uploads, uploadedSelections, "basic", template, androidThemeSlots)).toBe(true);
  });

  it("catalog raster transform은 target density 크기를 계약에 담는다", () => {
    expect(createAndroidImageCatalogTransform({ width: 432, height: 432, mode: "cover" })).toEqual({
      kind: "android-image",
      outputFormat: "png",
      fit: "cover",
      targetDimensions: { width: 432, height: 432 },
    });
  });
});

describe("나인패치 marker 해석", () => {
  const geometry = { stretch: { x: 30, y: 20 }, contentInsets: { top: 8, right: 12, bottom: 10, left: 14 } };
  const storedMarkers = {
    top: { start: 1, end: 3 },
    left: { start: 1, end: 3 },
    bottom: { start: 2, end: 40 },
    right: { start: 2, end: 30 },
  };
  const sourceMarkers = {
    top: { start: 30, end: 32 },
    left: { start: 20, end: 22 },
    bottom: { start: 10, end: 70 },
    right: { start: 8, end: 42 },
  };

  it("저장된 geometry가 저장된 marker보다 우선한다", () => {
    // 편집기는 geometry를 canonical로 쓰고 marker는 하위 호환용으로만 남긴다. 둘이 함께 있을 때
    // marker를 쓰면 방금 옮긴 값이 아니라 이전 좌표가 나간다.
    expect(resolveAndroidNinePatchMarkers({ geometry, markers: storedMarkers }, sourceMarkers, 80, 50)).toEqual(
      bubbleGeometryToAndroidMarkers(geometry, 80, 50),
    );
  });

  it("geometry가 없으면 저장된 marker를 그대로 쓴다", () => {
    expect(resolveAndroidNinePatchMarkers({ markers: storedMarkers }, sourceMarkers, 80, 50)).toBe(storedMarkers);
  });

  it("편집값이 없으면 source asset의 marker를 유지한다", () => {
    // undefined를 돌려주는 것이 계약이다. 호출부가 이때만 `asset.markers`를 그대로 둔다.
    expect(resolveAndroidNinePatchMarkers(undefined, sourceMarkers, 80, 50)).toBeUndefined();
    expect(resolveAndroidNinePatchMarkers({}, sourceMarkers, 80, 50)).toBeUndefined();
  });

  it("marker는 내부 크기에 맞춰 계산된다", () => {
    const narrow = resolveAndroidNinePatchMarkers({ geometry }, sourceMarkers, 40, 50);
    const wide = resolveAndroidNinePatchMarkers({ geometry }, sourceMarkers, 200, 50);
    expect(narrow).not.toEqual(wide);
  });

  it("flipX면 geometry를 marker로 바꾸기 전에 한 번 뒤집는다", () => {
    // 순서가 중요하다. marker로 바꾼 뒤 뒤집으면 stretch 패치 폭(2px) 때문에 1px 어긋난다.
    expect(resolveAndroidNinePatchMarkers({ geometry, flipX: true }, sourceMarkers, 80, 50)).toEqual(
      bubbleGeometryToAndroidMarkers(flipBubbleGeometryHorizontally(geometry, 80), 80, 50),
    );
  });

  it("flipX면 저장된 legacy marker도 좌우를 뒤집는다", () => {
    expect(resolveAndroidNinePatchMarkers({ markers: storedMarkers, flipX: true }, sourceMarkers, 80, 50)).toEqual(
      flipAndroidMarkersHorizontally(storedMarkers, 80),
    );
  });

  it("편집값이 없어도 flipX면 source marker를 뒤집어 내보낸다", () => {
    // artwork만 뒤집고 marker를 두면 늘어나는 구간과 글자 영역이 반대편에 남는다.
    expect(resolveAndroidNinePatchMarkers({ flipX: true }, sourceMarkers, 80, 50)).toEqual(
      flipAndroidMarkersHorizontally(sourceMarkers, 80),
    );
  });

  it("세로 marker는 좌우반전에서 그대로다", () => {
    const flipped = resolveAndroidNinePatchMarkers({ flipX: true }, sourceMarkers, 80, 50);
    expect(flipped?.left).toEqual(sourceMarkers.left);
    expect(flipped?.right).toEqual(sourceMarkers.right);
  });

  it("두 번 뒤집으면 원래 marker로 돌아온다", () => {
    expect(flipAndroidMarkersHorizontally(flipAndroidMarkersHorizontally(sourceMarkers, 80), 80)).toEqual(sourceMarkers);
  });
});

describe("서버 에셋 우회 판정", () => {
  const pngSlot = findSlot("android-main-background");

  it("로컬 템플릿 에셋이 아니면 항상 내려받아 처리한다", () => {
    expect(canUseServerAssetReference(pngSlot, "https://cdn.test/a.png")).toBe(false);
    expect(canUseServerAssetReference(pngSlot, "blob:http://localhost/abc")).toBe(false);
  });

  it("PNG로 나가는 슬롯은 원본도 PNG일 때만 그대로 넘긴다", () => {
    expect(canUseServerAssetReference(pngSlot, "/template-assets/bg.png")).toBe(true);
    expect(canUseServerAssetReference(pngSlot, "/template-assets/bg.PNG")).toBe(true);
    // 확장자만 PNG인 webp가 나가면 KakaoTalk이 읽지 못한다.
    expect(canUseServerAssetReference(pngSlot, "/template-assets/bg.webp")).toBe(false);
  });

  it("나인패치 슬롯은 원본이 PNG여도 marker를 다시 써야 하므로 blob 경로로 간다", () => {
    // `.9.png`로 끝나는 path도 `.png`로 끝나므로 확장자 검사만으로는 통과한다. 실제 우회 차단은
    // 호출부에서 ninepatch kind를 먼저 분기해 처리한다. 이 단언은 그 분기가 사라지면
    // 나인패치가 조용히 우회 경로로 넘어간다는 사실을 남겨 둔다.
    const bubble = findSlot("android-bubble-me-1");
    expect(bubble.kind).toBe("ninepatch");
    expect(canUseServerAssetReference(bubble, "/template-assets/bubble.9.png")).toBe(true);
  });
});
