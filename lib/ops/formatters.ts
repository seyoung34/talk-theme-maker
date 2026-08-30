import { getSiteUrl } from "@/lib/supabase/config";
import type { OpsEvent, OpsDetailValue } from "@/lib/ops/events";

const severityIcon: Record<OpsEvent["severity"], string> = {
  P1: "🚨",
  P2: "⚠️",
  P3: "ℹ️",
};

const detailLabels: Record<string, string> = {
  platform: "플랫폼",
  errorCode: "오류 코드",
  durationMs: "소요 시간(ms)",
  elapsedMs: "경과 시간(ms)",
  attemptCount: "시도 횟수",
  providerEventType: "Provider 이벤트",
  providerEventId: "Provider 이벤트 ID",
  failureCount: "실패 횟수",
  windowMinutes: "집계 구간(분)",
  dependency: "의존성",
  result: "처리 결과",
  status: "상태",
};

export function formatOpsEventForTelegram(event: OpsEvent, options: { siteUrl?: string } = {}) {
  const lines = [
    `${severityIcon[event.severity]} [${event.severity}] ${event.summary}`,
    "",
    `이벤트: ${event.type}`,
    `발생 시각: ${formatKoreanTime(event.occurredAt)}`,
  ];

  if (event.entity) lines.push(`${event.entity.kind}: ${event.entity.id}`);

  for (const [key, value] of Object.entries(event.details)) {
    if (!(key in detailLabels)) continue;
    lines.push(`${detailLabels[key] ?? key}: ${formatValue(value)}`);
  }

  const adminUrl = buildAdminUrl(event.adminPath, options.siteUrl ?? getSiteUrl());
  if (adminUrl) {
    lines.push("", `관리자 확인: ${adminUrl}`);
  }

  return lines.join("\n");
}

export function formatTelegramTestMessage(options: { environment?: string; now?: Date } = {}) {
  const environment = options.environment?.trim() || "unknown";
  const now = options.now ?? new Date();
  return [
    "✅ TalkTheme Telegram 알림 테스트",
    "",
    `환경: ${environment}`,
    `발생 시각: ${formatKoreanTime(now.toISOString())}`,
  ].join("\n");
}

function formatKoreanTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatValue(value: OpsDetailValue) {
  if (value === null) return "-";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

function buildAdminUrl(path: string | undefined, siteUrl: string) {
  if (!path) return undefined;
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return undefined;
  }
}
