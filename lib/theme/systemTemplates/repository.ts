import type { RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplatePage, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary, ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";

export type SystemTemplateRepository = {
  list(): Promise<SystemTemplateSummary[]>;
  listPage(options?: { cursor?: string; limit?: number; publicOnly?: boolean }): Promise<SystemTemplatePage>;
  getMetadata(id: string): Promise<SystemTemplateMetadataRecord | null>;
  get(id: string): Promise<SystemTemplateRecord | null>;
  hydrateUploads(uploadRefs: RemoteSlotUploads, slotIds?: string[]): Promise<ThemeEditOverrides["uploads"]>;
  save(input: SystemTemplateSaveInput): Promise<SystemTemplateRecord>;
  // 저장된 row 데이터로 previewMetadata(색상/refs/말풍선 stretch·insets)를 다시 계산해 갱신한다.
  // 렌더/저장 로직 개선을 기존 템플릿에 소급 반영할 때 사용. 카드 썸네일 webp는 보존한다.
  regeneratePreviewMetadata(id: string): Promise<void>;
  delete(id: string): Promise<void>;
};
