/**
 * 내보내기 결과 파일의 보관 기간.
 *
 * 출력 버킷 `kt-theme-build-output`은 객체 age 7일에 Delete하는 lifecycle을 갖는다
 * (2026-07-14 운영 버킷 확인, `docs/architecture/commercial-launch-phase-1-data-policy.md`).
 * 이 값을 바꾸면 lifecycle 규칙·개인정보 처리방침·해당 문서를 같은 변경에서 함께 고쳐야 한다.
 */
export const exportOutputRetentionMs = 7 * 24 * 60 * 60 * 1000;
// 기존 Android 전용 import와의 호환성을 유지한다.
export const androidExportOutputRetentionMs = exportOutputRetentionMs;

export type ExportDownloadState =
  /** 보관 기간 안이라 다시 받을 수 있다. */
  | "available"
  /** 성공했지만 보관 기간이 지나 결과 파일이 삭제됐다. */
  | "expired"
  /** 서버 결과 보관을 지원하지 않는 플랫폼 또는 출력 방식이다. */
  | "unsupported"
  /** 아직 완료되지 않았거나 실패했다. */
  | "unavailable";

type ExportDownloadInput = {
  platform: string;
  backend?: string;
  status: string;
  completedAt?: string | null;
  createdAt: string;
};

/**
 * GCS lifecycle은 객체가 만들어진 시각을 기준으로 지운다. 그 시각은 빌드가 끝난 때이므로
 * `completed_at`을 쓰고, 없으면 더 이른 `created_at`으로 보수적으로 판단한다.
 */
export function getExportDownloadExpiresAt(input: ExportDownloadInput): number | null {
  const reference = input.completedAt ?? input.createdAt;
  const completedAt = Date.parse(reference);
  return Number.isFinite(completedAt) ? completedAt + exportOutputRetentionMs : null;
}

export function getExportDownloadState(input: ExportDownloadInput, now: number = Date.now()): ExportDownloadState {
  if (input.status !== "succeeded") return "unavailable";
  if (input.platform !== "android" && input.platform !== "ios") return "unsupported";
  // Legacy iOS jobs were packaged in the Worker and have no server-side result object.
  if (input.platform === "ios" && input.backend !== "cloud_run") return "unsupported";

  const expiresAt = getExportDownloadExpiresAt(input);
  if (expiresAt === null) return "unavailable";
  return expiresAt > now ? "available" : "expired";
}
