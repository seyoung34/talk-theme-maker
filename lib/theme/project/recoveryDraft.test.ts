import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyThemeDraft } from "@/lib/theme/project/draft";
import { themeDatabaseStores, withThemeDatabaseStore } from "@/lib/theme/localDatabase";
import { clearRecoveryDraft, readRecoveryDraft, saveRecoveryDraft, type EditorMode, type EditorRecoveryDraft } from "@/lib/theme/project/recoveryDraft";

function input(mode: EditorMode = "user") {
  const draft = createEmptyThemeDraft();
  draft.colors = { background: "#12345680" };
  draft.bubbleFlipX = { bubble: true };
  draft.uploads = { background: [{ id: "upload-1", source: "user", file: new File(["image"], "photo.png", { type: "image/png" }) }] };
  return {
    editor: { mode, templateId: "basic" as const, platform: "android" as const, activeSection: "main" as const, activeGroup: "background" as const },
    draft,
    exportOptions: { exportMode: "apk" as const, name: "내 테마" },
    resume: { reason: "login_required" as const },
  };
}

beforeEach(async () => {
  await clearRecoveryDraft("user");
  await clearRecoveryDraft("admin");
});

afterEach(() => vi.restoreAllMocks());

describe("로그인·충전 왕복 복구 저장소", () => {
  it("토큰으로 저장한 편집 값과 내보내기 옵션을 복원하고 삭제한다", async () => {
    const saved = await saveRecoveryDraft(input());
    expect(saved.resume.reopenExportDialog).toBe(true);
    const restored = await readRecoveryDraft("user", saved.resume.token);
    expect(restored?.draft.colors).toEqual({ background: "#12345680" });
    expect(restored?.draft.bubbleFlipX).toEqual({ bubble: true });
    expect(restored?.draft.uploads.background?.[0]?.file?.name).toBe("photo.png");
    expect(restored?.exportOptions).toEqual({ exportMode: "apk", name: "내 테마" });
    await clearRecoveryDraft("user");
    expect(await readRecoveryDraft("user", saved.resume.token)).toBeNull();
  });

  it("토큰이 없거나 다르면 복원하지 않고 저장된 초안은 보존한다", async () => {
    const saved = await saveRecoveryDraft(input());
    expect(await readRecoveryDraft("user", null)).toBeNull();
    expect(await readRecoveryDraft("user", "different-token")).toBeNull();
    expect((await readRecoveryDraft("user", saved.resume.token))?.id).toBe(saved.id);
  });

  it("사용자와 관리자 모드를 분리한다", async () => {
    const user = await saveRecoveryDraft(input("user"));
    const admin = await saveRecoveryDraft(input("admin"));
    expect(await readRecoveryDraft("admin", user.resume.token)).toBeNull();
    expect((await readRecoveryDraft("admin", admin.resume.token))?.editor.mode).toBe("admin");
    await clearRecoveryDraft("admin");
    expect((await readRecoveryDraft("user", user.resume.token))?.editor.mode).toBe("user");
  });

  it("만료 경계에 도달한 레코드는 복원하지 않고 저장소에서 지운다", async () => {
    const saved = await saveRecoveryDraft(input());
    vi.spyOn(Date, "now").mockReturnValue(saved.expiresAt);
    expect(await readRecoveryDraft("user", saved.resume.token)).toBeNull();
    const raw = await withThemeDatabaseStore<EditorRecoveryDraft | undefined>(
      themeDatabaseStores.editorRecoveryDrafts, "readonly", (store) => store.get(saved.id),
    );
    expect(raw).toBeUndefined();
  });

  it("다시 저장하면 이전 토큰으로 새 복구본을 열 수 없다", async () => {
    const first = await saveRecoveryDraft(input());
    const second = await saveRecoveryDraft(input());
    expect(second.resume.token).not.toBe(first.resume.token);
    expect(await readRecoveryDraft("user", first.resume.token)).toBeNull();
    expect((await readRecoveryDraft("user", second.resume.token))?.id).toBe(second.id);
  });
});
