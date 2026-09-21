/**
 * 파일 선택기에서 받은 `File`을 즉시 바이트 기반 File로 바꾼다.
 *
 * Chromium은 일부 플랫폼에서 선택된 파일을 지연 참조로 보관한다. 그 참조가 바뀌거나
 * 무효화된 뒤 IndexedDB가 처음 바이트를 읽으면 `InvalidBlob`으로 저장을 거절할 수 있다.
 * 선택 순간에 읽어 새 File을 만들면 이후 자동 저장·내 템플릿 저장은 브라우저 Blob 저장소가
 * 관리하는 바이트만 다룬다.
 */
export async function materializeFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer();
  return new File([bytes], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * 같은 대상에 대한 비동기 요청이 엇갈릴 때 마지막 사용자 동작만 반영한다.
 *
 * 파일을 바이트로 읽는 시간은 파일마다 다르므로, 먼저 시작한 요청이 나중에 끝날 수 있다.
 */
export function createLatestRequestTracker() {
  let sequence = 0;
  const latestByKey = new Map<string, number>();

  return {
    begin(key: string) {
      const request = ++sequence;
      latestByKey.set(key, request);
      return request;
    },
    invalidate(key: string) {
      latestByKey.set(key, ++sequence);
    },
    isCurrent(key: string, request: number) {
      return latestByKey.get(key) === request;
    },
  };
}
