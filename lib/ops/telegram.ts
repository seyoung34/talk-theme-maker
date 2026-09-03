export type TelegramEnvironment = Record<string, string | undefined>;

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramSendResult = {
  providerMessageId: string | null;
};

export type TelegramErrorCode =
  | "telegram_not_configured"
  | "telegram_invalid_config"
  | "telegram_request_timeout"
  | "telegram_network_error"
  | "telegram_invalid_response"
  | "telegram_rate_limited"
  | "telegram_provider_error";

export class TelegramError extends Error {
  constructor(
    public readonly code: TelegramErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

export function isTelegramNotificationsEnabled(env: TelegramEnvironment = process.env) {
  return env.TELEGRAM_NOTIFICATIONS_ENABLED === "1";
}

export function readTelegramConfig(env: TelegramEnvironment = process.env): TelegramConfig | null {
  if (!isTelegramNotificationsEnabled(env)) return null;

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    throw new TelegramError(
      "telegram_not_configured",
      "Telegram 알림 설정이 완료되지 않았습니다.",
      false,
    );
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken) || chatId.length > 120) {
    throw new TelegramError(
      "telegram_invalid_config",
      "Telegram 알림 설정 형식이 올바르지 않습니다.",
      false,
    );
  }
  return { botToken, chatId };
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  options: {
    fetchImpl?: typeof fetch;
    apiBaseUrl?: string;
    timeoutMs?: number;
  } = {},
): Promise<TelegramSendResult> {
  const trimmedText = text.trim();
  if (!trimmedText) throw new TelegramError("telegram_invalid_response", "Telegram 메시지가 비어 있습니다.", false);

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);

  try {
    const response = await fetchImpl(`${apiBaseUrl}/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: trimmedText.slice(0, 3_800),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const payload = await readTelegramResponse(response);
    if (response.ok && payload?.ok === true) {
      const messageId = payload.result && typeof payload.result.message_id === "number"
        ? String(payload.result.message_id)
        : null;
      return { providerMessageId: messageId };
    }

    const providerCode = typeof payload?.error_code === "number" ? payload.error_code : response.status;
    if (response.status === 429 || providerCode === 429) {
      const retryAfterSeconds = payload?.parameters?.retry_after;
      throw new TelegramError(
        "telegram_rate_limited",
        "Telegram API 요청이 제한되었습니다.",
        true,
        response.status,
        typeof retryAfterSeconds === "number" ? retryAfterSeconds : undefined,
      );
    }
    const providerFailure = response.status >= 500 || providerCode >= 500;
    throw new TelegramError(
      providerFailure ? "telegram_provider_error" : "telegram_invalid_response",
      "Telegram API가 메시지를 받지 못했습니다.",
      providerFailure,
      response.status,
    );
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TelegramError("telegram_request_timeout", "Telegram API 요청 시간이 초과되었습니다.", true);
    }
    throw new TelegramError("telegram_network_error", "Telegram API 네트워크 요청에 실패했습니다.", true);
  } finally {
    clearTimeout(timeoutId);
  }
}

type TelegramResponse = {
  ok?: boolean;
  error_code?: number;
  result?: { message_id?: number };
  parameters?: { retry_after?: number };
};

async function readTelegramResponse(response: Response) {
  try {
    return (await response.json()) as TelegramResponse;
  } catch {
    return null;
  }
}
