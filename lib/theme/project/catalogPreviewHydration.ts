import { getThemeAssetSignedUrls } from "@/lib/theme/remoteAssets";
import type { SlotUploads } from "@/lib/theme/project/state";

/**
 * catalog 참조만 있는 업로드에 화면용 URL을 다시 붙인다.
 *
 * `previewUrl`은 만료되는 서명 URL이라 저장하지 않는다(`stripVolatileUploadFields`). 시스템
 * 템플릿은 `remoteUploadRefs`로 다시 수화하지만 **사용자 템플릿에는 그 경로가 없다** —
 * `getUserTemplate`가 돌려주는 것은 `uploads`뿐이고 편집기는 `remoteUploadRefs: {}`로 시작한다.
 * 그래서 저장한 프로젝트를 다시 열면 export는 참조로 정상 동작하는데 타일과 미리보기만 빈다.
 *
 * 만료되지 않는 `legacyStoragePath`를 저장해 두었으므로 그 경로를 다시 서명해 채운다.
 *
 * 서명은 실패할 수 있고(만료된 세션·경로 삭제) 그때는 원래 항목을 그대로 둔다. 미리보기를
 * 못 그리는 것은 감당할 수 있지만, 여기서 던지면 템플릿을 아예 못 여는 일이 된다.
 */
export async function hydrateCatalogPreviewUrls(uploads: SlotUploads): Promise<SlotUploads> {
  const paths = new Set<string>();
  for (const entries of Object.values(uploads)) {
    for (const entry of entries ?? []) {
      if (entry.file || entry.catalog?.previewUrl) continue;
      const path = entry.catalog?.legacyStoragePath;
      if (path) paths.add(path);
    }
  }
  if (!paths.size) return uploads;

  let signed: Record<string, string>;
  try {
    signed = await getThemeAssetSignedUrls([...paths]);
  } catch (error) {
    console.warn("Catalog preview signing failed; tiles fall back to template defaults.", error);
    return uploads;
  }

  const next: SlotUploads = {};
  let changed = false;
  for (const [slotId, entries] of Object.entries(uploads)) {
    if (!entries?.length) {
      next[slotId] = entries;
      continue;
    }
    next[slotId] = entries.map((entry) => {
      if (entry.file || !entry.catalog || entry.catalog.previewUrl) return entry;
      const previewUrl = entry.catalog.legacyStoragePath ? signed[entry.catalog.legacyStoragePath] : undefined;
      if (!previewUrl) return entry;
      changed = true;
      return { ...entry, catalog: { ...entry.catalog, previewUrl } };
    });
  }

  return changed ? next : uploads;
}
