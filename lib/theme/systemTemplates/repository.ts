import type { RemoteSlotUploads, SystemTemplateMetadataRecord, SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary, ThemeEditOverrides } from "@/lib/theme/systemTemplates/types";

export type SystemTemplateRepository = {
  list(): Promise<SystemTemplateSummary[]>;
  getMetadata(id: string): Promise<SystemTemplateMetadataRecord | null>;
  get(id: string): Promise<SystemTemplateRecord | null>;
  hydrateUploads(uploadRefs: RemoteSlotUploads, slotIds?: string[]): Promise<ThemeEditOverrides["uploads"]>;
  save(input: SystemTemplateSaveInput): Promise<SystemTemplateRecord>;
  delete(id: string): Promise<void>;
};
