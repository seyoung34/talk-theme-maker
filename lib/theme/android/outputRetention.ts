/**
 * 내보내기 결과 파일의 보관 기간.
 *
 * 출력 버킷 `kt-theme-build-output`은 객체 age 7일에 Delete하는 lifecycle을 갖는다
 * (2026-07-14 운영 버킷 확인, `docs/architecture/commercial-launch-phase-1-data-policy.md`).
 * 이 값을 바꾸면 lifecycle 규칙·개인정보 처리방침·해당 문서를 같은 변경에서 함께 고쳐야 한다.
 */
export const androidExportOutputRetentionMs = 7 * 24 * 60 * 60 * 1000;

export type ExportDownloadState =
  /** 보관 기간 안이라 다시 받을 수 있다. */
  | "available"
  /** 성공했지만 보관 기간이 지나 결과 파일이 삭제됐다. */
  | "expired"
  /** 서버에 보관되는 결과물이 없는 방식이다(iOS는 동기 응답으로 바로 내려받는다). */
  | "unsupported"
  /** 아직 완료되지 않았거나 실패했다. */
  | "unavailable";

type ExportDownloadInput = {
  platform: string;
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
  return Number.isFinite(completedAt) ? completedAt + androidExportOutputRetentionMs : null;
}

export function getExportDownloadState(input: ExportDownloadInput, now: number = Date.now()): ExportDownloadState {
  if (input.status !== "succeeded") return "unavailable";
  // iOS 내보내기는 응답 본문으로 파일을 바로 내려주고 서버에 남기지 않는다.
  if (input.platform !== "android") return "unsupported";

  const expiresAt = getExportDownloadExpiresAt(input);
  if (expiresAt === null) return "unavailable";
  return expiresAt > now ? "available" : "expired";
}
