// 내보내기 경로는 슬롯/파일 수십 개를 순회하며 fetch·디코딩·업로드를 반복한다.
// 순차 처리는 왕복 지연이 그대로 누적되고, 무제한 병렬은 브라우저 연결 한도와
// 메모리를 넘긴다. 그래서 동시 실행 개수만 제한한 워커 풀로 처리한다.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
