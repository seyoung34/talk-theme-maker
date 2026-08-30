/**
 * 목록을 화면 한 장 분량씩 자른다.
 *
 * 계정 화면의 "크레딧 내역"과 "최근 테마 파일"이 같은 규칙으로 잘려야 두 캐러셀이 같은 수의
 * 줄을 보여 준다. 한쪽만 다르게 자르면 나란히 놓인 두 카드의 높이가 어긋난다.
 */
export function chunkIntoPages<T>(items: readonly T[], pageSize: number): T[][] {
  const size = Math.max(1, Math.floor(pageSize));
  // 비어 있어도 한 장은 만든다. 0장이면 호출부가 "0 / 0"을 그리거나 빈 캐러셀을 만든다.
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    pages.push(items.slice(start, start + size));
  }
  return pages;
}
