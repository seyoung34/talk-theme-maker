import type { Policy } from "./model.js";

export type Config = {
  origin: string; accountTag: string; scriptName: string; cloudflareToken: string;
  readinessToken: string; bucket: string; object: string; messagesObject: string;
  telegramToken: string; telegramChatId: string; alertsEnabled: boolean; policy: Policy;
};

/** 상태 버킷 안의 운영 문구 템플릿 위치. `npm run monitor:messages:push`가 여기에 올린다. */
export const messagesObjectName = "monitor/messages-v1.json";

/** 장애가 이어질 때 새 "장애 지속" 메시지를 보내는 간격(분). 마지막 값을 계속 반복한다. */
export const defaultRepeatMinutes = "30,60,120,240";

function repeatSchedule(raw: string | undefined) {
  const value = raw?.trim() || defaultRepeatMinutes;
  const minutes = value.split(",").map(part => part.trim());
  if (minutes.length > 8 || minutes.some(part => !/^\d{1,4}$/.test(part))) throw new Error("monitor_configuration_invalid");
  const numbers = minutes.map(Number);
  // 줄어드는 간격은 오타일 가능성이 높다. 5분 미만은 검사 주기보다 짧아 매 tick 재알림과 같아진다.
  if (numbers.some((n, i) => n < 5 || n > 1440 || (i > 0 && n < numbers[i - 1]))) throw new Error("monitor_configuration_invalid");
  return numbers.map(n => n * 60_000);
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error("monitor_configuration_missing");
    return value;
  };
  const integer = (key: string, min: number, max: number) => {
    const value = required(key);
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw new Error("monitor_configuration_invalid");
    return number;
  };
  const origin = new URL(required("MONITOR_TARGET_ORIGIN"));
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("monitor_configuration_invalid");
  const accountTag = required("MONITOR_CF_ACCOUNT_TAG");
  const scriptName = required("MONITOR_CF_SCRIPT_NAME");
  const readinessToken = required("MONITOR_READINESS_TOKEN");
  const bucket = required("MONITOR_STATE_BUCKET");
  const alertsEnabled = env.MONITOR_ALERTS_ENABLED === "1";
  const telegramToken = alertsEnabled ? required("MONITOR_TELEGRAM_BOT_TOKEN") : "";
  const telegramChatId = alertsEnabled ? required("MONITOR_TELEGRAM_CHAT_ID") : "";
  if (!/^[a-f0-9]{32}$/i.test(accountTag) || !/^[a-zA-Z0-9_-]{1,63}$/.test(scriptName)
    || !/^[A-Za-z0-9_-]{32,256}$/.test(readinessToken) || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)
    || (alertsEnabled && (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(telegramToken) || !/^-?\d{1,20}$/.test(telegramChatId)))) throw new Error("monitor_configuration_invalid");
  return {
    origin: origin.origin, accountTag, scriptName, readinessToken, bucket,
    object: "monitor/state-v1.json", messagesObject: messagesObjectName, cloudflareToken: required("MONITOR_CF_API_TOKEN"),
    telegramToken, telegramChatId, alertsEnabled,
    policy: {
      failureChecks: integer("MONITOR_FAILURE_CHECKS", 1, 10),
      recoveryChecks: integer("MONITOR_RECOVERY_CHECKS", 1, 10),
      cooldownMs: integer("MONITOR_COOLDOWN_SECONDS", 300, 86400) * 1000,
      repeatScheduleMs: repeatSchedule(env.MONITOR_REPEAT_MINUTES),
      runtimeFailureCount: integer("MONITOR_RUNTIME_FAILURE_COUNT", 1, 1000000),
      runtimeFailureRate: integer("MONITOR_RUNTIME_FAILURE_PERCENT", 1, 100) / 100,
    },
  };
}
