export const maxExportRequestBytes = 50 * 1024 * 1024;

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
