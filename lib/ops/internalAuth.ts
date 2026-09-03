export type OpsInternalAuthResult =
  | { ok: true }
  | { ok: false; reason: "configuration_missing" | "unauthorized" };

export type TelegramWebhookAuthResult =
  | { ok: true }
  | { ok: false; reason: "configuration_missing" | "configuration_invalid" | "unauthorized" };

export function authorizeOpsInternalRequest(request: Request, env: Record<string, string | undefined> = process.env): OpsInternalAuthResult {
  const configuredToken = env.OPS_NOTIFICATIONS_DRAIN_TOKEN?.trim();
  if (!configuredToken) return { ok: false, reason: "configuration_missing" };

  const requestToken = request.headers.get("x-ops-notifications-token") ?? "";
  return constantTimeEqual(requestToken, configuredToken)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

export function authorizeTelegramWebhookRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): TelegramWebhookAuthResult {
  const configuredSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) return { ok: false, reason: "configuration_missing" };
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(configuredSecret)) {
    return { ok: false, reason: "configuration_invalid" };
  }

  const requestSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  return constantTimeEqual(requestSecret, configuredSecret)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
