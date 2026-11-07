import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveUserTemplate = vi.fn();
vi.mock("@/lib/theme/userTemplates", () => ({ saveUserTemplate: (...args: unknown[]) => saveUserTemplate(...args) }));
vi.mock("@/components/project/editorSession", () => ({ persistEditorSession: vi.fn() }));
vi.mock("@/lib/analytics/ga4", () => ({ trackAnalyticsEvent: vi.fn() }));
vi.mock("@/lib/theme/systemTemplates", () => ({ systemTemplateRepository: { save: vi.fn() } }));

import { useTemplatePersistence } from "@/components/project/hooks/useTemplatePersistence";

const bundleA = "abcdef01-2345-6789-abcd-ef0123456789";
const bundleB = "abcdef02-2345-6789-abcd-ef0123456789";

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    activeSystemTemplate: null,
    activeUserTemplate: null,
    bubbleGeometry: {}, bubbleInsets: {}, bubbleMarkers: {}, bubbleStretch: {}, bubbleFlipX: {},
    bubbleDesigns: {}, bubbleDecorationSources: {},
    candidateSelections: {}, colors: {},
    ensureSystemTemplateUploadsHydrated: vi.fn(async () => ({})),
    isAdminMode: false,
    mode: "user" as const,
    platform: "android" as const,
    saveMode: "saveAs" as const,
    saveName: "내 템플릿",
    setActiveSystemTemplate: vi.fn(),
    setActiveUserTemplate: vi.fn(),
    setNotice: vi.fn(),
    setSaveDialogOpen: vi.fn(),
    setSystemSaveDialogOpen: vi.fn(),
    setSystemTemplateBundleId: vi.fn(),
    setSourceSystemTemplateBundleId: vi.fn(),
    sourceSystemTemplateBundleId: null,
    systemCreditCost: "", systemDescription: "", systemPriceAmount: "", systemPricingType: "free" as const,
    systemStatus: "draft" as const, systemTags: "", systemTemplateBundleId: null, systemTitle: "", systemVisibility: "private" as const,
    templateId: "basic" as const,
    ...overrides,
  };
}

function systemTemplate(bundleId: string) {
  return { id: "variant-id", bundleId, title: "원본", tags: [], status: "published", visibility: "public", pricingType: "free", createdAt: 1 };
}

async function save(options: ReturnType<typeof createOptions>) {
  const { result } = renderHook(() => useTemplatePersistence(options as never));
  await act(async () => { await result.current.saveCurrentTemplate(); });
}

function lastSavedOrigin() {
  return saveUserTemplate.mock.calls.at(-1)?.[0].sourceSystemTemplateBundleId;
}

beforeEach(() => {
  saveUserTemplate.mockReset();
  saveUserTemplate.mockImplementation(async (record: Record<string, unknown>) => ({
    ...record, id: (record.id as string | undefined) ?? "user-template:1", name: "내 템플릿", createdAt: 1, updatedAt: 2, templateId: "basic", platform: "android",
    sourceSystemTemplateBundleId: record.sourceSystemTemplateBundleId ?? null,
  }));
});

describe("useTemplatePersistence 시스템 템플릿 출처", () => {
  it("시스템 템플릿에서 시작해 처음 저장하면 그 bundle을 기록하고 별도 상태에 반영한다", async () => {
    const options = createOptions({ activeSystemTemplate: systemTemplate(bundleA), systemTemplateBundleId: bundleA });
    await save(options);

    expect(lastSavedOrigin()).toBe(bundleA);
    expect(options.setSourceSystemTemplateBundleId).toHaveBeenCalledWith(bundleA);
  });

  it("내 템플릿이 열려 있으면 남아 있는 시스템 템플릿 상태가 아니라 별도 출처 상태를 기록한다", async () => {
    // 저장 직후에도 activeSystemTemplate/systemTemplateBundleId는 남는다. 다른 bundle이어도 따라가지 않는다.
    const options = createOptions({
      activeSystemTemplate: systemTemplate(bundleB),
      systemTemplateBundleId: bundleB,
      activeUserTemplate: { id: "user-template:1", name: "내 템플릿", createdAt: 1 },
      sourceSystemTemplateBundleId: bundleA,
      saveMode: "overwrite" as const,
    });
    await save(options);

    expect(lastSavedOrigin()).toBe(bundleA);
  });

  it("출처가 기록되지 않은 내 템플릿을 덮어써도 남아 있는 시스템 상태에서 추정하지 않는다", async () => {
    const options = createOptions({
      activeSystemTemplate: systemTemplate(bundleB),
      systemTemplateBundleId: bundleB,
      activeUserTemplate: { id: "user-template:1", name: "내 템플릿", createdAt: 1 },
      sourceSystemTemplateBundleId: null,
      saveMode: "overwrite" as const,
    });
    await save(options);

    expect(lastSavedOrigin()).toBeNull();
  });

  it("기본 템플릿에서 시작한 작업은 null을 명시적으로 기록한다", async () => {
    await save(createOptions());

    expect(saveUserTemplate.mock.calls[0][0]).toHaveProperty("sourceSystemTemplateBundleId", null);
  });

  it("다른 이름으로 저장은 현재 작업의 출처를 이어받는다", async () => {
    const options = createOptions({
      activeUserTemplate: { id: "user-template:1", name: "내 템플릿", createdAt: 1 },
      sourceSystemTemplateBundleId: bundleA,
      saveMode: "saveAs" as const,
    });
    await save(options);

    expect(saveUserTemplate.mock.calls[0][0].id).toBeUndefined();
    expect(lastSavedOrigin()).toBe(bundleA);
  });
});
