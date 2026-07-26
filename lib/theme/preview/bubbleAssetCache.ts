// 말풍선 나인패치 파싱 결과를 재사용한다.
//
// 편집기는 섹션·슬롯을 오갈 때마다 같은 말풍선 4종을 다시 그린다. 파싱은 매번
// 디코딩 + 캔버스 2개 + 테두리 스캔이라, 화면을 왕복할 때마다 같은 비용을 다시 낸다.
// 결과 객체는 아무도 변형하지 않고(마커 변경은 항상 새 객체를 만든다) 캔버스만 읽으므로
// 그대로 공유해도 된다.
import type { BubbleAsset } from "@/lib/theme/types";

// 말풍선 4종 × 안드로이드/iOS × 최근에 본 몇 벌 정도를 담는다.
const maxCachedAssets = 24;

const assets = new Map<string, BubbleAsset>();
// 프리뷰 4개가 동시에 같은 파일을 요청할 수 있어, 진행 중인 파싱도 공유한다.
const pending = new Map<string, Promise<BubbleAsset>>();

// load는 캐시가 비었을 때만 부른다. 원본을 받아 오는 비용까지 아끼기 위해서다.
export async function loadCachedBubbleAsset(cacheKey: string, load: () => Promise<BubbleAsset>): Promise<BubbleAsset> {
  const cached = assets.get(cacheKey);
  if (cached) {
    touch(cacheKey, cached);
    return cached;
  }

  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;

  const task = load()
    .then((asset) => {
      touch(cacheKey, asset);
      return asset;
    })
    .finally(() => {
      pending.delete(cacheKey);
    });

  pending.set(cacheKey, task);
  return task;
}

export function clearBubbleAssetCache() {
  assets.clear();
  pending.clear();
}

function touch(cacheKey: string, asset: BubbleAsset) {
  // Map은 삽입 순서를 유지한다. 다시 넣어 최근 사용 항목을 뒤로 보낸다.
  assets.delete(cacheKey);
  assets.set(cacheKey, asset);
  while (assets.size > maxCachedAssets) {
    const oldest = assets.keys().next();
    if (oldest.done) break;
    assets.delete(oldest.value);
  }
}
