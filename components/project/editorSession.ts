import { readTemplateStartPayload } from "@/lib/theme/project/state";
import { templateStartStorageKey, type ThemeStartPayload } from "@/lib/theme/templates";

export const editorSessionStorageKey = (mode: "user" | "admin") => `kakaotalk-theme-maker:editor-session:${mode}:v1`;

export function takeTemplateStartPayload(mode: "user" | "admin") {
  const pendingPayload = readTemplateStartPayload(templateStartStorageKey);
  if (pendingPayload && (!pendingPayload.editMode || pendingPayload.editMode === mode)) {
    // autosaveAction은 이 1회성 payload에서만 유효하다. 영속 세션 사본에 그대로 남기면, 다음에
    // 이 사본으로 폴백해서 읽을 때(예: 리마운트) 오래된 resume/replace 결정이 재사용되어 조용히
    // 잘못 복원되거나 다이얼로그가 뜻하지 않게 다시 뜬다. 세션에는 액션을 빼고 저장한다.
    const persistablePayload: ThemeStartPayload = { ...pendingPayload, editMode: mode };
    delete persistablePayload.autosaveAction;
    persistEditorSession(mode, persistablePayload);
    localStorage.removeItem(templateStartStorageKey);
    return pendingPayload;
  }

  return readTemplateStartPayload(editorSessionStorageKey(mode));
}

export function persistEditorSession(mode: "user" | "admin", payload: ThemeStartPayload) {
  localStorage.setItem(editorSessionStorageKey(mode), JSON.stringify(payload));
}
