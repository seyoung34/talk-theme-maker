import { getMissingRemoteUploadSlotIds, mergeSlotUploads } from "@/components/project/projectImporterHelpers";
import { hydrateCatalogPreviewUrls } from "@/lib/theme/project/catalogPreviewHydration";
import type { SlotUploads } from "@/lib/theme/project/state";
import { systemTemplateRepository, type RemoteSlotUploads } from "@/lib/theme/systemTemplates";

/** Restore transient image sources for previews without changing the saved project. */
export async function preparePersonalPreviewUploads(uploads: SlotUploads, refs: RemoteSlotUploads = {}): Promise<SlotUploads> {
  let result = await hydrateCatalogPreviewUrls(uploads);
  const missing = getMissingRemoteUploadSlotIds(refs, result);
  if (!missing.length) return result;
  try {
    const hydrated = await systemTemplateRepository.hydrateUploads(refs, missing);
    result = mergeSlotUploads(result, hydrated);
  } catch (error) {
    console.warn("Personal preview assets could not be restored.", error);
  }
  return result;
}
