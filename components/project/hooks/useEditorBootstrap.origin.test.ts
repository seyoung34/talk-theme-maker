import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const takeTemplateStartPayload = vi.fn();
const readAutosaveDraft = vi.fn();
const getUserTemplate = vi.fn();
const readRecoveryDraft = vi.fn();

vi.mock("@/components/project/editorSession", () => ({
  persistEditorSession: vi.fn(),
  takeTemplateStartPayload: (...args: unknown[]) => takeTemplateStartPayload(...args),
}));
vi.mock("@/lib/theme/project/autosaveDraft", () => ({
  readAutosaveDraft: (...args: unknown[]) => readAutosaveDraft(...args),
  clearAutosaveDraft: vi.fn(async () => undefined),
}));
vi.mock("@/lib/theme/project/recoveryDraft", () => ({
  readRecoveryDraft: (...args: unknown[]) => readRecoveryDraft(...args),
  clearRecoveryDraft: vi.fn(async () => undefined),
}));
vi.mock("@/lib/theme/userTemplates", () => ({ getUserTemplate: (...args: unknown[]) => getUserTemplate(...args) }));
vi.mock("@/lib/theme/project/catalogPreviewHydration", () => ({ hydrateCatalogPreviewUrls: vi.fn(async (uploads: unknown) => uploads) }));
vi.mock("@/lib/theme/systemTemplates", () => ({ systemTemplateRepository: { getMetadata: vi.fn(), get: vi.fn() } }));

import { useEditorBootstrap } from "@/components/project/hooks/useEditorBootstrap";
import { createInitialThemeDraft } from "@/lib/theme/project/draft";

const bundleA = "abcdef01-2345-6789-abcd-ef0123456789";

function createOptions() {
  return {
    hydratePreviewUploads: vi.fn(async () => ({})),
    mode: "user" as const,
    onRecoveryRestored: vi.fn(),
    requestAutosaveDecision: vi.fn(async () => "discard" as const),
    onAutosaveArmed: vi.fn(),
    onAutosaveRestored: vi.fn(),
    resumeToken: null,
    setActiveGroup: vi.fn(), setActiveSection: vi.fn(), setActiveSystemTemplate: vi.fn(), setActiveUserTemplate: vi.fn(),
    setInitialLoadState: vi.fn(), setNotice: vi.fn(), setPlatform: vi.fn(), setSelectedSlotId: vi.fn(),
    setSystemCreditCost: vi.fn(), setSystemDescription: vi.fn(), setSystemPriceAmount: vi.fn(), setSystemPricingType: vi.fn(),
    setSystemStatus: vi.fn(), setSystemTags: vi.fn(), setSystemTemplateBundleId: vi.fn(), setSourceSystemTemplateBundleId: vi.fn(),
    setSystemTitle: vi.fn(), setSystemVisibility: vi.fn(), setTemplateId: vi.fn(),
    replaceDraft: vi.fn(), skipDefaultSelectionReset: vi.fn(),
  };
}

function userTemplateRecord(sourceSystemTemplateBundleId?: string | null) {
  return {
    id: "user-template:1", name: "내 템플릿", templateId: "basic", platform: "android", createdAt: 1, updatedAt: 2,
    colors: {}, uploads: {}, candidateSelections: {},
    bubbleEdits: { geometry: {}, markers: {}, insets: {}, stretch: {}, flipX: {} },
    bubbleDesigns: {}, bubbleDecorationSources: {},
    ...(sourceSystemTemplateBundleId === undefined ? {} : { sourceSystemTemplateBundleId }),
  };
}

function autosaveRecord(sourceSystemTemplateBundleId?: string) {
  return {
    id: "editor-autosave:user", version: 1, mode: "user", createdAt: 1, updatedAt: 2, expiresAt: 9999999999999,
    source: {
      templateId: "basic", platform: "android", templateName: "내 템플릿",
      activeUserTemplate: { id: "user-template:1", name: "내 템플릿", createdAt: 1 },
      ...(sourceSystemTemplateBundleId ? { sourceSystemTemplateBundleId } : {}),
    },
    editor: { activeSection: "main", activeGroup: "background" },
    draft: createInitialThemeDraft("android", "basic"),
  };
}

function recoveryRecord(sourceSystemTemplateBundleId?: string) {
  return {
    id: "editor-recovery:user", version: 1, createdAt: 1, updatedAt: 2, expiresAt: 9999999999999,
    resume: { reason: "login_required", token: "token", reopenExportDialog: true },
    editor: {
      mode: "user", templateId: "basic", platform: "android",
      activeUserTemplate: { id: "user-template:1", name: "내 템플릿", createdAt: 1 },
      ...(sourceSystemTemplateBundleId ? { sourceSystemTemplateBundleId } : {}),
      activeSection: "main", activeGroup: "background",
    },
    draft: createInitialThemeDraft("android", "basic"),
    exportOptions: { exportMode: "apk", name: "테마" },
  };
}

function lastOrigin(options: ReturnType<typeof createOptions>) {
  return options.setSourceSystemTemplateBundleId.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  takeTemplateStartPayload.mockReset();
  readAutosaveDraft.mockReset().mockResolvedValue(null);
  getUserTemplate.mockReset();
  readRecoveryDraft.mockReset().mockResolvedValue(null);
});

describe("useEditorBootstrap 시스템 템플릿 출처 복원", () => {
  it("내 템플릿을 열면 레코드의 출처 bundle을 복원한다", async () => {
    takeTemplateStartPayload.mockReturnValue({ templateId: "basic", platform: "android", userTemplateId: "user-template:1", editMode: "user" });
    getUserTemplate.mockResolvedValue(userTemplateRecord(bundleA));
    const options = createOptions();
    renderHook(() => useEditorBootstrap(options as never));

    await waitFor(() => expect(options.setActiveUserTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: "user-template:1" })));
    expect(lastOrigin(options)).toBe(bundleA);
  });

  it("출처가 기록되지 않은 내 템플릿은 null이고 payload의 시스템 bundle로 채우지 않는다", async () => {
    takeTemplateStartPayload.mockReturnValue({ templateId: "basic", platform: "android", userTemplateId: "user-template:1", systemTemplateBundleId: bundleA, editMode: "user" });
    getUserTemplate.mockResolvedValue(userTemplateRecord());
    const options = createOptions();
    renderHook(() => useEditorBootstrap(options as never));

    await waitFor(() => expect(options.setActiveUserTemplate).toHaveBeenCalled());
    expect(lastOrigin(options)).toBeNull();
  });

  it("다른 작업을 시작하면 이전 출처를 이어받지 않는다", async () => {
    takeTemplateStartPayload.mockReturnValue({ templateId: "basic", platform: "android", editMode: "user" });
    const options = createOptions();
    renderHook(() => useEditorBootstrap(options as never));

    await waitFor(() => expect(options.onAutosaveArmed).toHaveBeenCalled());
    expect(options.setSourceSystemTemplateBundleId).toHaveBeenCalledWith(null);
    expect(lastOrigin(options)).toBeNull();
  });

  it("자동 저장을 이어하면 저장된 출처를 복원한다", async () => {
    takeTemplateStartPayload.mockReturnValue({ templateId: "basic", platform: "android", userTemplateId: "user-template:1", autosaveAction: "resume", editMode: "user" });
    readAutosaveDraft.mockResolvedValue(autosaveRecord(bundleA));
    const options = createOptions();
    renderHook(() => useEditorBootstrap(options as never));

    await waitFor(() => expect(options.onAutosaveRestored).toHaveBeenCalled());
    expect(lastOrigin(options)).toBe(bundleA);
  });

  it("출처 필드가 없는 기존 자동 저장은 null로 복원한다", async () => {
    takeTemplateStartPayload.mockReturnValue({ templateId: "basic", platform: "android", userTemplateId: "user-template:1", autosaveAction: "resume", editMode: "user" });
    readAutosaveDraft.mockResolvedValue(autosaveRecord());
    const options = createOptions();
    renderHook(() => useEditorBootstrap(options as never));

    await waitFor(() => expect(options.onAutosaveRestored).toHaveBeenCalled());
    expect(lastOrigin(options)).toBeNull();
  });

  it("로그인·충전 복구는 저장된 출처를 복원하고, 필드가 없으면 null이다", async () => {
    takeTemplateStartPayload.mockReturnValue(null);
    readRecoveryDraft.mockResolvedValue(recoveryRecord(bundleA));
    const withOrigin = createOptions();
    renderHook(() => useEditorBootstrap({ ...withOrigin, resumeToken: "token" } as never));
    await waitFor(() => expect(withOrigin.onRecoveryRestored).toHaveBeenCalled());
    expect(lastOrigin(withOrigin)).toBe(bundleA);

    readRecoveryDraft.mockResolvedValue(recoveryRecord());
    const withoutOrigin = createOptions();
    renderHook(() => useEditorBootstrap({ ...withoutOrigin, resumeToken: "token" } as never));
    await waitFor(() => expect(withoutOrigin.onRecoveryRestored).toHaveBeenCalled());
    expect(lastOrigin(withoutOrigin)).toBeNull();
  });
});
