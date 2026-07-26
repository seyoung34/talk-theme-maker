/**
 * 내보내기 실패 사유 코드.
 *
 * 이 값은 GA4 `export_failed.failure_reason`으로 나가므로 두 가지 제약을 지켜야 한다.
 *
 * 1. 카디널리티가 고정돼야 한다. 서버 원문 메시지나 Cloud Run 빌더가 `error.name`에서 만들어내는
 *    임의 코드를 그대로 흘리면 분석 축이 무한히 늘어난다. 허용 목록에 없는 값은 호출 맥락에 맞는
 *    대표 코드로 접는다.
 * 2. 개인정보가 섞이면 안 된다. 파일명·이메일·사용자 입력 문자열은 어떤 경로로도 이 값이 되지 않는다.
 *    허용 목록과 대조해 통과한 상수만 반환하므로 구조적으로 보장된다.
 */
export const exportFailureReasons = [
  // 인증·과금 — 사용자 행동으로 해결 가능한 실패
  "unauthenticated",
  "insufficient_credits",
  "export_already_in_progress",

  // 요청 크기
  "payload_too_large",
  "export_payload_too_large",
  "export_file_too_large",

  // 요청 형식 — 클라이언트가 만든 번들이 서버 계약과 어긋난 경우
  "invalid_request",
  "invalid_form_data",
  "missing_manifest",
  "invalid_manifest",
  "invalid_manifest_json",
  "invalid_manifest_count",
  "invalid_manifest_item",
  "invalid_manifest_field",
  "missing_export_file",
  "duplicate_export_path",
  "invalid_export_path",
  "forbidden_export_path",
  "invalid_server_asset",
  "missing_server_asset",
  "invalid_export_mode",
  "unsupported_export_mode",
  "invalid_export_name",
  "invalid_version_name",
  "invalid_application_id",

  // iOS 패키지 검증
  "missing_theme_css",
  "invalid_theme_css",
  "invalid_theme_css_encoding",
  "invalid_theme_identifier",
  "invalid_png_file",
  "missing_referenced_image",

  // 서버·빌드 파이프라인
  "server_error",
  "android_export_failed",
  "ios_export_failed",
  "enqueue_failed",
  "missing_application_id",
  "missing_theme_identifier",
  "invalid_server_theme_identifier",
  "android_build_failed",
  "build_capacity_reached",
  "android_sdk_missing",
  "gradle_timeout",
  "build_cancelled",
  "build_watchdog_timeout",
  "ownership_check_failed",
  "ownership_mismatch",
  "export_job_not_found",
  "status_check_failed",
  "invalid_job_id",

  // 클라이언트에서만 판별되는 실패
  "network_error",
  "poll_timeout",
  "poll_failed",
  "download_failed",
  "preparation_failed",
  "unknown",
] as const;

export type ExportFailureReason = (typeof exportFailureReasons)[number];

const allowedReasons = new Set<string>(exportFailureReasons);

export function isExportFailureReason(value: unknown): value is ExportFailureReason {
  return typeof value === "string" && allowedReasons.has(value);
}

/** 허용 목록에 있으면 그대로 쓰고, 없으면 맥락에 맞는 `fallback`으로 접는다. */
export function toExportFailureReason(value: unknown, fallback: ExportFailureReason): ExportFailureReason {
  return isExportFailureReason(value) ? value : fallback;
}

/**
 * 서버가 `reason`을 내려주지 않았을 때 쓰는 HTTP 상태 기반 기본값.
 * 라우트별 reason 코드가 늘어나도 상태 코드 의미는 유지되므로 안전한 하한선이다.
 */
export function getExportFailureReasonFromStatus(status: number): ExportFailureReason {
  if (status === 401) return "unauthenticated";
  if (status === 402) return "insufficient_credits";
  if (status === 409) return "export_already_in_progress";
  if (status === 413) return "payload_too_large";
  if (status >= 500) return "server_error";
  if (status >= 400) return "invalid_request";
  return "unknown";
}

/**
 * `fetch` 자체가 실패한 경우(오프라인, DNS, CORS, 중단)를 네트워크 오류로 구분한다.
 * 서버가 응답을 준 실패와 섞이면 "내보내기가 왜 실패하는가"를 판단할 수 없다.
 */
export function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}
