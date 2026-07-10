import { readTemplateStartPayload } from "@/lib/theme/project/state";
import { templateStartStorageKey, type ThemeStartPayload } from "@/lib/theme/templates";

export const editorSessionStorageKey = (mode: "user" | "admin") => `kakaotalk-theme-maker:editor-session:${mode}:v1`;

export function takeTemplateStartPayload(mode: "user" | "admin") {
  const pendingPayload = readTemplateStartPayload(templateStartStorageKey);
  if (pendingPayload && (!pendingPayload.editMode || pendingPayload.editMode === mode)) {
    persistEditorSession(mode, { ...pendingPayload, editMode: mode });
    localStorage.removeItem(templateStartStorageKey);
    return pendingPayload;
  }

  return readTemplateStartPayload(editorSessionStorageKey(mode));
}

export function persistEditorSession(mode: "user" | "admin", payload: ThemeStartPayload) {
  localStorage.setItem(editorSessionStorageKey(mode), JSON.stringify(payload));
}
