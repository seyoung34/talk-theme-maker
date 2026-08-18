// 씬 레지스트리. `--scenes=` 인자가 여기 있는 id를 고른다.
//
// 클립을 통짜로 찍지 않고 씬으로 끊는 이유는 편집기 UI가 바뀌었을 때 바뀐 씬만 다시 찍기
// 위해서다(계획서 §5). manifest에 씬 경계 시각이 남으므로 합성 쪽에서 잘라 쓸 수 있다.
import { editorTour } from "./editorTour.mjs";
import { guideChangeColor, guideChooseScreen } from "./guideSteps.mjs";
import { mobileEdit } from "./mobileEdit.mjs";
import { templateGallery } from "./templateGallery.mjs";

export const allScenes = [templateGallery, editorTour, guideChooseScreen, guideChangeColor, mobileEdit];

/**
 * 프로필별 기본 구성. mock 환경(시스템 템플릿 없음)에서도 도는 씬만 넣는다.
 * 갤러리를 지나는 씬은 로컬 스택 + 촬영용 seed가 있어야 한다(계획서 §2.8).
 */
const defaultsByProfile = {
  // 가이드는 스텝마다 파일이 따로 나간다. 여기 나열한 순서가 `/guide` 스텝 순서다.
  guide: ["choose-screen", "change-color"],
  reel: ["mobile-edit"],
};

export function defaultSceneIds(profileId) {
  return defaultsByProfile[profileId] ?? ["editor-tour"];
}

export function selectScenes(ids) {
  return ids.map((id) => {
    const scene = allScenes.find((candidate) => candidate.id === id);
    if (!scene) {
      throw new Error(`알 수 없는 씬: ${id}. 가능한 값: ${allScenes.map((s) => s.id).join(", ")}`);
    }
    return scene;
  });
}
