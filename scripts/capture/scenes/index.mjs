// 씬 레지스트리. `--scenes=` 인자가 여기 있는 id를 고른다.
//
// 클립을 통짜로 찍지 않고 씬으로 끊는 이유는 편집기 UI가 바뀌었을 때 바뀐 씬만 다시 찍기
// 위해서다(계획서 §5). manifest에 씬 경계 시각이 남으므로 합성 쪽에서 잘라 쓸 수 있다.
import { editorTour } from "./editorTour.mjs";
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
import { templateGallery } from "./templateGallery.mjs";

/**
 * 씬 id는 프로필 안에서만 유일하면 된다. 데스크톱과 모바일 가이드가 같은 스텝을 가리키므로
 * 일부러 같은 id를 쓴다 — 파일명은 프로필이 갈라 주고, content.ts에서 media/mobileMedia로 짝이 된다.
 */
const scenesByProfile = {
  guide: [guideChooseScreen, guideChangeColor, guidePickBackground, guidePickIcons, guideEditBubble],
  "guide-mobile": [guideMobileChooseScreen, guideMobileChangeColor, guidePickBackgroundMobile, guidePickIconsMobile, guideEditBubbleMobile],
  reel: [mobileEdit],
};

const sharedScenes = [templateGallery, editorTour];

/**
 * 프로필별 기본 구성. mock 환경(시스템 템플릿 없음)에서도 도는 씬만 넣는다.
 * 갤러리를 지나는 씬은 로컬 스택 + 촬영용 seed가 있어야 한다(계획서 §2.8).
 */
export function defaultSceneIds(profileId) {
  return (scenesByProfile[profileId] ?? sharedScenes).map((scene) => scene.id);
}

export function selectScenes(ids, profileId) {
  const available = [...(scenesByProfile[profileId] ?? []), ...sharedScenes];
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
