import type { RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplatePage, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateStatus, SystemTemplateSummary, SystemTemplateVisibility, ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";

export type SystemTemplateRepository = {
  list(): Promise<SystemTemplateSummary[]>;
  listPage(options?: { cursor?: string; limit?: number; publicOnly?: boolean }): Promise<SystemTemplatePage>;
  getMetadata(id: string): Promise<SystemTemplateMetadataRecord | null>;
  get(id: string): Promise<SystemTemplateRecord | null>;
  hydrateUploads(uploadRefs: RemoteSlotUploads, slotIds?: string[]): Promise<ThemeEditOverrides["uploads"]>;
  save(input: SystemTemplateSaveInput): Promise<SystemTemplateRecord>;
  updatePublication(bundleId: string, input: { status: SystemTemplateStatus; visibility: SystemTemplateVisibility }): Promise<void>;
  updateTags(bundleId: string, tags: string[]): Promise<void>;
  // 저장된 row 데이터로 previewMetadata(색상/refs/말풍선 stretch·insets)를 다시 계산해 갱신한다.
  // 렌더/저장 로직 개선을 기존 템플릿에 소급 반영할 때 사용.
  //
  // 이미지 로드/canvas 렌더 실패는 그 템플릿만의 문제라 기존 카드 썸네일 webp를 보존하고
  // 메타 갱신은 계속한다. 반면 서명 URL 생성·Storage 요청·업로드 같은 인프라 실패는 던진다.
  // 다음 템플릿에서도 똑같이 실패할 것이므로 호출자가 일괄 처리를 즉시 멈춰야 한다.
  regeneratePreviewMetadata(id: string): Promise<void>;
  delete(id: string): Promise<void>;
};
