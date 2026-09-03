import { getGa4VisitorConfigStatus } from "@/lib/analytics/ga4DataApi";
import {
  formatOpsDailySummaryForTelegram,
  formatOpsHealthForTelegram,
  formatOpsIssuesForTelegram,
  formatOpsStatusForTelegram,
} from "@/lib/ops/formatters";
import { getOpsStatusSnapshot, listRecentOpsIssues } from "@/lib/ops/repository";
import { getCurrentOpsDay, getPreviousOpsDay, readOpsDailySummary } from "@/lib/ops/dailySummary";

export const opsCommandNames = ["help", "today", "yesterday", "status", "health", "issues"] as const;
export type OpsCommandName = (typeof opsCommandNames)[number];
export type ParsedOpsCommand = {
  name: OpsCommandName | "unknown";
  args: string[];
};

export function parseOpsTelegramCommand(text: string): ParsedOpsCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = /^\/([A-Za-z][A-Za-z0-9_]{0,31})(?:@[A-Za-z0-9_]{1,64})?(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return { name: "unknown", args: [] };
  const candidate = match[1]?.toLowerCase() ?? "";
  const normalizedCandidate = candidate === "start" ? "help" : candidate;
  const name = (opsCommandNames as readonly string[]).includes(normalizedCandidate)
    ? normalizedCandidate as OpsCommandName
    : "unknown" as const;
  const args = match[2]?.trim() ? match[2].trim().split(/\s+/) : [];
  return { name, args };
}

export async function getOpsCommandReply(
  parsed: ParsedOpsCommand,
  options: {
    now?: Date;
    telegramStatus?: "configured" | "disabled" | "invalid";
  } = {},
) {
  if (parsed.name === "unknown") return formatOpsHelpForTelegram("알 수 없는 명령입니다.");
  if (parsed.args.length > 0) return formatOpsHelpForTelegram("인자가 없는 읽기 전용 명령입니다.");
  if (parsed.name === "help") return formatOpsHelpForTelegram();

  try {
    switch (parsed.name) {
      case "today": {
        const summary = await readOpsDailySummary(getCurrentOpsDay(options.now));
        return formatOpsDailySummaryForTelegram(summary, { title: "TalkTheme 오늘 운영 현황" });
      }
      case "yesterday": {
        const summary = await readOpsDailySummary(getPreviousOpsDay(options.now));
        return formatOpsDailySummaryForTelegram(summary, { title: "TalkTheme 전일 운영 요약" });
      }
      case "status":
        return formatOpsStatusForTelegram(await getOpsStatusSnapshot());
      case "health": {
        let database: "ok" | "error" = "ok";
        let status;
        try {
          status = await getOpsStatusSnapshot();
        } catch (error) {
          database = "error";
          console.error("[ops-command] health_database_failed", { name: error instanceof Error ? error.name : "unknown_error" });
        }
        return formatOpsHealthForTelegram({
          database,
          telegram: options.telegramStatus ?? "configured",
          ga4: getGa4HealthStatus(),
          ...(status ? { status } : {}),
        });
      }
      case "issues":
        return formatOpsIssuesForTelegram(await listRecentOpsIssues({ limit: 8 }));
    }
  } catch (error) {
    console.error("[ops-command] query_failed", {
      command: parsed.name,
      name: error instanceof Error ? error.name : "unknown_error",
    });
    return "⚠️ 운영 정보를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function formatOpsHelpForTelegram(prefix?: string) {
  return [
    ...(prefix ? [`⚠️ ${prefix}`, ""] : []),
    "🤖 TalkTheme 운영 봇 명령어",
    "",
    "/today — 오늘 누적 현황",
    "/yesterday — 전일 운영 요약",
    "/status — 현재 대기·재시도 상태",
    "/health — DB·Telegram·GA4 설정 점검",
    "/issues — 최근 P1/P2 이슈와 미종결 문의",
    "/help — 이 도움말",
    "",
    "모든 명령은 조회 전용이며 고객에게 알림을 보내거나 데이터를 변경하지 않습니다.",
  ].join("\n");
}

function getGa4HealthStatus(): "configured" | "not_configured" | "invalid" {
  const status = getGa4VisitorConfigStatus();
  return status === "configured" ? "configured" : status === "invalid" ? "invalid" : "not_configured";
}
