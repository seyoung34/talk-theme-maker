import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates/types";

/**
 * 슬롯 묶음이 참조하는 Storage 경로 전부.
 *
 * 편집 전 원본(`imageEdit.originalStoragePath`)도 별도 객체라 함께 센다. 빠뜨리면 원본만
 * 단건 서명으로 남아 예열의 의미가 절반으로 줄어든다.
 *
 * 중복은 걸러 내지 않는다. 공유 업로드로 여러 슬롯이 같은 파일을 가리킬 수 있는데,
 * `getThemeAssetSignedUrls`가 이미 Set으로 정리하므로 여기서 한 번 더 돌 이유가 없다.
 */
export function collectRemoteUploadPaths(uploadRefs: RemoteSlotUploads, slotIds?: string[]) {
  const allowed = slotIds?.length ? new Set(slotIds) : null;
  const paths: string[] = [];

  for (const [slotId, entries] of Object.entries(uploadRefs)) {
    if (allowed && !allowed.has(slotId)) continue;
    for (const entry of entries ?? []) {
      if (entry.storagePath) paths.push(entry.storagePath);
      if (entry.catalogMetadata?.legacyStoragePath) paths.push(entry.catalogMetadata.legacyStoragePath);
      if (entry.imageEdit?.originalStoragePath) paths.push(entry.imageEdit.originalStoragePath);
    }
  }

  return paths;
}
