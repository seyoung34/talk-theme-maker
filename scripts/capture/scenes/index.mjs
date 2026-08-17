// 씬 레지스트리. `--scenes=` 인자가 여기 있는 id를 고른다.
//
// 클립을 통짜로 찍지 않고 씬으로 끊는 이유는 편집기 UI가 바뀌었을 때 바뀐 씬만 다시 찍기
// 위해서다(계획서 §5). manifest에 씬 경계 시각이 남으므로 합성 쪽에서 잘라 쓸 수 있다.
import { editorTour } from "./editorTour.mjs";
import { templateGallery } from "./templateGallery.mjs";

export const allScenes = [templateGallery, editorTour];

/** mock 환경(시스템 템플릿 없음)에서도 도는 기본 구성. */
export const defaultSceneIds = ["editor-tour"];

export function selectScenes(ids) {
  return ids.map((id) => {
    const scene = allScenes.find((candidate) => candidate.id === id);
    if (!scene) {
      throw new Error(`알 수 없는 씬: ${id}. 가능한 값: ${allScenes.map((s) => s.id).join(", ")}`);
    }
    return scene;
  });
}
