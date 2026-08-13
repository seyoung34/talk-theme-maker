import { generateSystemTemplateThumbnail } from "@/lib/theme/systemTemplates/thumbnail";
import type { UserTemplateRecord } from "@/lib/theme/userTemplates";

/**
 * 구운 썸네일 Blob을 템플릿별로 들고 있는 세션 캐시.
 *
 * 키에 `updatedAt`을 넣어 저장할 때마다 자동으로 무효화한다. 템플릿 하나당 한 항목만 두므로
 * 같은 템플릿을 다시 저장하면 이전 Blob이 교체되고, 캐시가 템플릿 수 이상으로 자라지 않는다.
 *
 * object URL이 아니라 Blob을 캐시한다. object URL은 화면을 떠날 때 revoke되므로 캐시에 담아 두면
 * 다음 진입에서 이미 죽은 URL이 된다. Blob은 살아 있고, 비싼 쪽은 URL 생성이 아니라 렌더→canvas→인코딩이다.
 *
 * 전체 새로고침까지 살아남지는 않는다. 영속 썸네일 store는 저장 구조 변경(Phase 2)에 묶여 있어
 * 측정 gate 뒤에 둔다 — `docs/plans/in-progress/editor-asset-storage-mobile-ux-plan.md` §1.1.
 */
const thumbnailCache = new Map<string, { key: string; pending: Promise<Blob | null> }>();
const thumbnailCacheLimit = 32;

/**
 * 내 템플릿/최근 작업 카드에 시스템 템플릿 갤러리 카드와 같은 합성 썸네일을 만들어 준다.
 *
 * 내 템플릿은 브라우저 로컬(IndexedDB)에만 있고 서버로 올라가지 않는다 — 시스템 템플릿처럼
 * Supabase에 썸네일을 구워 올리는 경로를 태우지 않는다(영속 경로는 분리 유지). 대신 같은
 * `generateSystemTemplateThumbnail` 렌더러(관리자 저장·`/dev/bake-thumbnails`와 동일)를 브라우저에서만
 * 실행해 미리보기용 Blob을 만든다. 실패해도(예: 이미지 디코딩 오류) 카드는 기존 CSS 목업으로 남는다.
 */
export async function bakeUserTemplateCardThumbnail(record: UserTemplateRecord): Promise<string | undefined> {
  const blob = await getUserTemplateCardThumbnailBlob(record);
  return blob ? URL.createObjectURL(blob) : undefined;
}

export function getUserTemplateCardThumbnailBlob(record: UserTemplateRecord): Promise<Blob | null> {
  const key = `${record.id}:${record.updatedAt}`;
  const cached = thumbnailCache.get(record.id);
  if (cached?.key === key) return cached.pending;

  // 진행 중인 굽기도 캐시에 넣는다. 최근 작업 카드와 목록 카드가 같은 레코드를 동시에 요구할 수 있다.
  const pending = renderUserTemplateCardThumbnail(record).catch((error) => {
    console.error(error);
    // 실패는 캐시하지 않는다. 남겨 두면 다음 진입에서도 CSS 목업에 갇힌다.
    if (thumbnailCache.get(record.id)?.key === key) thumbnailCache.delete(record.id);
    return null;
  });

  thumbnailCache.set(record.id, { key, pending });
  while (thumbnailCache.size > thumbnailCacheLimit) {
    const oldest = thumbnailCache.keys().next();
    if (oldest.done) break;
    thumbnailCache.delete(oldest.value);
  }
  return pending;
}

export function clearUserTemplateCardThumbnailCache() {
  thumbnailCache.clear();
}

function renderUserTemplateCardThumbnail(record: UserTemplateRecord): Promise<Blob | null> {
  return generateSystemTemplateThumbnail({
    baseTemplateId: record.templateId,
    platform: record.platform,
    overrides: {
      colors: record.colors,
      uploads: record.uploads,
      candidateSelections: record.candidateSelections,
      bubbleEdits: { ...record.bubbleEdits, designs: record.bubbleDesigns ?? {} },
    },
  });
}
