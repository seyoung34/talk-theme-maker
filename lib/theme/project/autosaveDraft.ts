import { themeDatabaseStores, withThemeDatabaseStore, withThemeDatabaseTransaction } from "@/lib/theme/localDatabase";
import type {
  EditorActiveSystemTemplate,
  EditorActiveUserTemplate,
  EditorMode,
  EditorSystemTemplateMetadata,
  ThemeDraft,
} from "@/lib/theme/project/draft";
import type { ThemeTemplateId } from "@/lib/theme/templates";
import type { ThemePlatform, ThemeSection, ThemeSlotGroup } from "@/lib/theme/types";

/**
 * 편집기 자동 저장 레코드.
 *
 * 로그인·충전 왕복 복구(`EditorRecoveryDraft`)와 형태가 비슷하지만 목적과 수명주기가 다르다.
 * 복구 레코드는 사용자가 의도적으로 화면을 떠날 때 `resumeToken`과 함께 한 번 저장되고 돌아오면
 * 소비된다. 이 레코드는 편집 중 계속 갱신되며, 사용자가 명시적으로 이어할지 결정하기 전에는
 * 적용되지 않는다. 그래서 store와 id를 분리해 서로 덮어쓰거나 지우지 않게 한다.
 */
export type EditorAutosaveDraft = {
  id: `editor-autosave:${EditorMode}`;
  version: 1;
  mode: EditorMode;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  source: {
    templateId: ThemeTemplateId;
    platform: ThemePlatform;
    /** 복원 여부를 묻는 화면에서 "무엇을 이어하는지" 보여주기 위한 이름. */
    templateName: string;
    activeUserTemplate?: EditorActiveUserTemplate;
    activeSystemTemplate?: EditorActiveSystemTemplate;
    systemTemplateBundleId?: string;
  };
  editor: {
    activeSection: ThemeSection;
    activeGroup: ThemeSlotGroup;
    selectedSlotId?: string;
    /** 관리자 모드에서 저장 전 편집 중인 시스템 템플릿 메타데이터. 일반 사용자 편집에는 없다. */
    systemTemplateMetadata?: EditorSystemTemplateMetadata;
  };
  draft: ThemeDraft;
};

export type EditorAutosaveInput = Omit<EditorAutosaveDraft, "id" | "version" | "createdAt" | "updatedAt" | "expiresAt">;

/** 복구 레코드와 같은 보관 기간을 쓴다. 그보다 오래된 초안은 사용자도 맥락을 잃는다. */
export const autosaveDraftTtlMs = 7 * 24 * 60 * 60 * 1000;

/**
 * 저장 공간이 부족한 경우. 이미지가 여러 장 올라간 초안은 수백 MB가 될 수 있어 드물지 않다.
 * 조용히 실패하면 사용자는 저장되고 있다고 오해하므로 별도 타입으로 구분해 화면에 알린다.
 */
export class AutosaveQuotaExceededError extends Error {
  constructor() {
    super("autosave_quota_exceeded");
    this.name = "AutosaveQuotaExceededError";
  }
}

/**
 * 다른 탭이 먼저 저장한 경우 `stale`을 돌려주고 이 탭의 쓰기는 버린다.
 * MVP에서 자동 병합은 하지 않는다. 오래된 탭이 최신 초안을 덮는 쪽이 더 나쁘기 때문이다.
 */
export type AutosaveWriteResult = { status: "saved"; record: EditorAutosaveDraft } | { status: "stale" };

export function autosaveDraftId(mode: EditorMode): EditorAutosaveDraft["id"] {
  return `editor-autosave:${mode}`;
}

export async function readAutosaveDraft(mode: EditorMode): Promise<EditorAutosaveDraft | null> {
  const record = await withThemeDatabaseStore<EditorAutosaveDraft | undefined>(
    themeDatabaseStores.editorAutosaveDrafts,
    "readonly",
    (store) => store.get(autosaveDraftId(mode)),
  );
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await clearAutosaveDraft(mode);
    return null;
  }
  return record;
}

/**
 * `expectedUpdatedAt`은 이 탭이 마지막으로 확인한 레코드의 `updatedAt`이다.
 * `null`은 "레코드가 없어야 한다"는 뜻으로, 새로 시작했거나 방금 정리한 직후에 쓴다.
 */
export async function writeAutosaveDraft(
  input: EditorAutosaveInput,
  expectedUpdatedAt: number | null,
): Promise<AutosaveWriteResult> {
  const now = Date.now();
  const record: EditorAutosaveDraft = {
    ...input,
    id: autosaveDraftId(input.mode),
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + autosaveDraftTtlMs,
  };

  try {
    const outcome = await withThemeDatabaseTransaction<AutosaveWriteResult["status"]>(
      themeDatabaseStores.editorAutosaveDrafts,
      "readwrite",
      (store, setResult) => {
        const getRequest = store.get(record.id);
        getRequest.onsuccess = () => {
          const existing = getRequest.result as EditorAutosaveDraft | undefined;
          if (isStaleWrite(existing, expectedUpdatedAt)) {
            setResult("stale");
            return;
          }
          // createdAt은 최초 저장 시각을 유지한다. "언제부터 편집 중인지"를 잃지 않기 위해서다.
          store.put(existing ? { ...record, createdAt: existing.createdAt } : record);
          setResult("saved");
        };
      },
    );

    return outcome === "stale" ? { status: "stale" } : { status: "saved", record };
  } catch (error) {
    if (isQuotaExceeded(error)) throw new AutosaveQuotaExceededError();
    throw error;
  }
}

export async function clearAutosaveDraft(mode: EditorMode) {
  await withThemeDatabaseStore<undefined>(
    themeDatabaseStores.editorAutosaveDrafts,
    "readwrite",
    (store) => store.delete(autosaveDraftId(mode)),
  );
}

/**
 * 이어할지 묻는 화면에서 "무엇이 들어 있는지" 보여주기 위한 요약.
 * 사용자는 템플릿 이름만으로는 어느 쪽이 자기 작업인지 판단하기 어렵다.
 */
export function describeAutosaveDraft(record: EditorAutosaveDraft) {
  const { draft } = record;
  const uploadCount = Object.values(draft.uploads).reduce((total, entries) => total + (entries?.length ?? 0), 0);
  const colorCount = Object.values(draft.colors).filter((value) => Boolean(value)).length;
  const bubbleEditSlotIds = new Set([
    ...Object.keys(draft.bubbleGeometry),
    ...Object.keys(draft.bubbleMarkers),
    ...Object.keys(draft.bubbleInsets),
    ...Object.keys(draft.bubbleStretch),
  ]);

  return { uploadCount, colorCount, bubbleEditCount: bubbleEditSlotIds.size };
}

export function isStaleWrite(existing: EditorAutosaveDraft | undefined, expectedUpdatedAt: number | null) {
  // 레코드가 없어야 하는데 있으면 다른 탭이 만들었다는 뜻이다.
  if (!existing) return false;
  if (expectedUpdatedAt === null) return true;
  return existing.updatedAt !== expectedUpdatedAt;
}

export function isQuotaExceeded(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError";
  }
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "QuotaExceededError";
}
