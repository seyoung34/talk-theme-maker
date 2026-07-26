import { describe, expect, it } from "vitest";
import { createRecentWorkUserTemplateInput, formatRecentWorkTemplateName } from "@/lib/theme/project/recentWork";
import { createEmptyThemeDraft } from "@/lib/theme/project/draft";
import type { EditorAutosaveDraft } from "@/lib/theme/project/autosaveDraft";

describe("recent work", () => {
  it("자동 저장 시각으로 수정 가능한 내 템플릿 이름을 만든다", () => {
    expect(formatRecentWorkTemplateName(new Date(2026, 6, 27, 10).getTime())).toBe("자동저장-0727");
  });

  it("원격 hydrate 결과보다 autosave의 같은 ID 파일을 우선한다", () => {
    const hydrated = new File(["old"], "old.png", { type: "image/png" });
    const edited = new File(["new"], "new.png", { type: "image/png" });
    const record: EditorAutosaveDraft = {
      id: "editor-autosave:user",
      version: 1,
      mode: "user",
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
      source: { templateId: "basic", platform: "android", templateName: "테스트" },
      editor: { activeSection: "main", activeGroup: "background" },
      draft: {
        ...createEmptyThemeDraft(),
        uploads: { slot: [{ id: "same", file: edited, source: "user" }] },
      },
    };

    const result = createRecentWorkUserTemplateInput(record, {
      slot: [{ id: "same", file: hydrated, source: "template" }],
    });

    expect(result.uploads.slot?.[0]?.file.name).toBe("new.png");
  });
});
