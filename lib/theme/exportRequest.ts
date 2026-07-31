export const maxExportRequestBytes = 50 * 1024 * 1024;

/**
 * 내보낸 테마에 찍히는 버전.
 *
 * 사용자가 정할 이유가 없어 입력을 두지 않는다. 카카오톡은 이 값을 테마 목록에 보여주지
 * 않고, 같은 테마를 다시 받아도 버전을 올릴 필요가 없다. 파일명에도 넣지 않는다.
 * Android는 build.gradle.kts의 기본값이 이미 같은 값이라 서버가 따로 쓰지 않는다.
 */
export const themeVersionName = "1.0.0";

// 브라우저에서 내보내기 파일을 만들 때 동시에 해석할 슬롯 수.
// 대부분 fetch 대기라 병렬이 유리하지만, 캔버스 디코딩이 메인 스레드를 쓰므로
// 동시에 살아 있는 이미지 버퍼가 너무 많아지지 않게 제한한다.
export const exportSlotConcurrency = 6;

export function isExportRequestTooLarge(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;

  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes > maxExportRequestBytes;
}

export function getExportRequestTooLargePayload() {
  return {
    error: "내보낼 파일의 전체 크기는 50MB 이하여야 합니다. 큰 이미지를 줄인 후 다시 시도해 주세요.",
    reason: "payload_too_large",
    maxBytes: maxExportRequestBytes,
  };
}
