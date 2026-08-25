// 씬 레지스트리. `--scenes=` 인자가 여기 있는 id를 고른다.
//
// 클립을 통짜로 찍지 않고 씬으로 끊는 이유는 편집기 UI가 바뀌었을 때 바뀐 씬만 다시 찍기
// 위해서다(계획서 §5). manifest에 씬 경계 시각이 남으므로 합성 쪽에서 잘라 쓸 수 있다.
import { editorTour } from "./editorTour.mjs";
import { guideExportDialog, guideExportDialogMobile } from "./exportDialog.mjs";
import {
  guideEditBubble,
  guideEditBubbleMobile,
  guidePickBackground,
  guidePickBackgroundMobile,
  guidePickIcons,
  guidePickIconsMobile,
} from "./guideAssetSteps.mjs";
import { guideChangeColor, guideChooseScreen, guideMobileChangeColor, guideMobileChooseScreen } from "./guideSteps.mjs";
import { mobileEdit } from "./mobileEdit.mjs";
import { templateGallery, templateGalleryIos, templateGalleryIosMobile, templateGalleryMobile } from "./templateGallery.mjs";

/**
 * 씬 id는 프로필 안에서만 유일하면 된다. 데스크톱과 모바일 가이드가 같은 스텝을 가리키므로
 * 일부러 같은 id를 쓴다 — 파일명은 프로필이 갈라 주고, content.ts에서 media/mobileMedia로 짝이 된다.
 */
/**
 * iOS 편집기 씬. 지금은 **기본 구성에 넣지 않는다.**
 *
 * 만들어 놓고 쓰지 않는 이유는 실제로 찍어 비교한 결과다. 미리보기가 플랫폼마다 다르게 그려지는
 * 것은 사실이지만(헤더 색·섹션 제목 색), 실제 화면에서 눈에 띄는 차이는 **상단 플랫폼 배지와
 * 슬롯 이름 정도**였다. 그중 슬롯 이름은 매니페스트에서 같은 role에 같은 라벨을 주어 해결했다.
 *
 * 남는 차이 하나 때문에 클립 6개(약 3MB)를 더 두는 것은 값이 맞지 않는다. iOS 가이드는 Android
 * 클립을 그대로 쓴다.
 *
 * **필요해지면 여기서 바로 되살릴 수 있다.** 헤더 색을 크게 다르게 준 테마에서는 갈릴 수 있고,
 * 그때는 `scenesByProfile`에 `...iosEditorScenes`를 더하면 된다. 실행은 확인했다 —
 * `--scenes=ios-...`로 여섯 씬 모두 돌아간다.
 *
 * 같은 씬을 **플랫폼만 바꿔** 다시 돌린다.
 *
 * 편집기 조작은 플랫폼과 무관하게 같지만 **미리보기가 다르게 그려진다** — 헤더 색이 Android는
 * 별도 슬롯이고 iOS는 메인 배경색을 그대로 쓴다(`ThemeScreensPreview`). Android 클립을 iOS
 * 가이드에 쓰면 그 사람 화면에 없는 헤더를 가르치게 된다.
 *
 * 씬 코드를 복사하지 않는 이유는 **편집기가 바뀌면 두 벌을 다 고쳐야 하기 때문**이다. 조작이
 * 같은데 코드가 둘이면 한쪽만 낡는다. 여기서는 id와 플랫폼만 갈아 끼운다.
 */
const asIos = (scene) => ({ ...scene, id: `ios-${scene.id}`, platform: "ios", requiresLocal: true });

const iosEditorScenes = [
  asIos(templateGalleryIos),
  asIos(guideChooseScreen),
  asIos(guideChangeColor),
  asIos(guidePickBackground),
  asIos(guidePickIcons),
  asIos(guideEditBubble),
];

const iosEditorScenesMobile = [
  asIos(templateGalleryIosMobile),
  asIos(guideMobileChooseScreen),
  asIos(guideMobileChangeColor),
  asIos(guidePickBackgroundMobile),
  asIos(guidePickIconsMobile),
  asIos(guideEditBubbleMobile),
];

const scenesByProfile = {
  guide: [templateGallery, guideChooseScreen, guideChangeColor, guidePickBackground, guidePickIcons, guideEditBubble, guideExportDialog],
  "guide-mobile": [templateGalleryMobile, guideMobileChooseScreen, guideMobileChangeColor, guidePickBackgroundMobile, guidePickIconsMobile, guideEditBubbleMobile, guideExportDialogMobile],
  reel: [mobileEdit],
};

const sharedScenes = [templateGallery, editorTour];




/**
 * 프로필별 기본 구성. mock 환경(시스템 템플릿 없음)에서도 도는 씬만 넣는다.
 * 갤러리를 지나는 씬은 로컬 스택 + 촬영용 seed가 있어야 한다(계획서 §2.8).
 */
export function defaultSceneIds(profileId, environment = "mock") {
  return (scenesByProfile[profileId] ?? sharedScenes)
    .filter((scene) => environment !== "mock" || !scene.requiresLocal)
    .map((scene) => scene.id);
}

/**
 * 기본 구성에는 없지만 `--scenes=`로 고를 수 있는 씬.
 *
 * 매번 찍을 값어치는 없지만 **필요할 때 바로 돌릴 수 있어야** 하는 것들을 둔다. 목록에서 빼는
 * 순간 이름으로도 못 고르게 되면, 되살리려면 코드를 고쳐야 하고 그때는 이미 낡아 있다.
 */
const optionalScenes = {
  guide: iosEditorScenes,
  "guide-mobile": iosEditorScenesMobile,
};

export function selectScenes(ids, profileId) {
  const available = [...(scenesByProfile[profileId] ?? []), ...(optionalScenes[profileId] ?? []), ...sharedScenes];
  return ids.map((id) => {
    const scene = available.find((candidate) => candidate.id === id);
    if (!scene) {
      throw new Error(
        `'${profileId}' 프로필에 '${id}' 씬이 없습니다. 가능한 값: ${available.map((s) => s.id).join(", ")}`,
      );
    }
    return scene;
  });
}
