import { beforeEach, describe, expect, it } from "vitest";
import { deleteLocalUserThemeData } from "@/lib/theme/project/deleteLocalUserData";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import { templateStartStorageKey } from "@/lib/theme/templates";

describe("deleteLocalUserThemeData", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears user projects and drafts without removing admin or system template caches", async () => {
    await withThemeDatabaseStore(themeDatabaseStores.userTemplates, "readwrite", (store) => store.put({ id: "user-template" }));
    await withThemeDatabaseStore(themeDatabaseStores.userProjects, "readwrite", (store) => store.put({ id: "user-project" }));
    await withThemeDatabaseStore(themeDatabaseStores.projectAssets, "readwrite", (store) => store.put({ id: "project-asset" }));
    await withThemeDatabaseStore(themeDatabaseStores.projectThumbnails, "readwrite", (store) => store.put({ id: "project-thumbnail" }));
    await withThemeDatabaseStore(themeDatabaseStores.editorRecoveryDrafts, "readwrite", (store) => store.put({ id: "recovery" }));
    await withThemeDatabaseStore(themeDatabaseStores.editorAutosaveDrafts, "readwrite", (store) => store.put({ id: "autosave" }));
    await withThemeDatabaseStore(themeDatabaseStores.adminAssets, "readwrite", (store) => store.put({ id: "admin-asset" }));
    await withThemeDatabaseStore(themeDatabaseStores.systemTemplates, "readwrite", (store) => store.put({ id: "system-template" }));
    localStorage.setItem(templateStartStorageKey, "{}");
    localStorage.setItem("kakaotalk-theme-maker:editor-session:user:v1", "{}");

    await deleteLocalUserThemeData();

    await expect(withThemeDatabaseStore(themeDatabaseStores.userTemplates, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.userProjects, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.projectAssets, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.projectThumbnails, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.editorRecoveryDrafts, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.editorAutosaveDrafts, "readonly", (store) => store.getAll())).resolves.toEqual([]);
    await expect(withThemeDatabaseStore(themeDatabaseStores.adminAssets, "readonly", (store) => store.get("admin-asset"))).resolves.toBeTruthy();
    await expect(withThemeDatabaseStore(themeDatabaseStores.systemTemplates, "readonly", (store) => store.get("system-template"))).resolves.toBeTruthy();
    expect(localStorage.getItem(templateStartStorageKey)).toBeNull();
    expect(localStorage.getItem("kakaotalk-theme-maker:editor-session:user:v1")).toBeNull();
  });
});
