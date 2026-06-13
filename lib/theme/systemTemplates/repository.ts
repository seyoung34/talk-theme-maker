import type { SystemTemplateRecord, SystemTemplateSaveInput, SystemTemplateSummary } from "@/lib/theme/systemTemplates/types";

export type SystemTemplateRepository = {
  list(): Promise<SystemTemplateSummary[]>;
  get(id: string): Promise<SystemTemplateRecord | null>;
  save(input: SystemTemplateSaveInput): Promise<SystemTemplateRecord>;
  delete(id: string): Promise<void>;
};
