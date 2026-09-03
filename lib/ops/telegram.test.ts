import { describe, expect, it, vi } from "vitest";
import {
  readTelegramConfig,
  sendTelegramMessage,
  TelegramError,
} from "@/lib/ops/telegram";

describe("Telegram adapter", () => {
  it("returns no config while notifications are disabled", () => {
    expect(readTelegramConfig({ TELEGRAM_NOTIFICATIONS_ENABLED: "0" })).toBeNull();
  });

  it("requires both the token and chat ID when enabled", () => {
    expect(() => readTelegramConfig({ TELEGRAM_NOTIFICATIONS_ENABLED: "1" }))
      .toThrowError(TelegramError);
  });

  it("sends a plain text message without leaking configuration", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: { message_id: 42 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(sendTelegramMessage({
      botToken: "123456789:abcdefghijklmnopqrst",
      chatId: "987654321",
    }, "hello", { fetchImpl, apiBaseUrl: "https://telegram.test" })).resolves.toEqual({
      providerMessageId: "42",
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://telegram.test/bot123456789:abcdefghijklmnopqrst/sendMessage", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ chat_id: "987654321", text: "hello", disable_web_page_preview: true }),
    }));
  });

  it("marks rate limits as retryable and keeps the provider message out of the error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error_code: 429,
      parameters: { retry_after: 7 },
    }), { status: 429 }));

    await expect(sendTelegramMessage({
      botToken: "123456789:abcdefghijklmnopqrst",
      chatId: "987654321",
    }, "hello", { fetchImpl, apiBaseUrl: "https://telegram.test" })).rejects.toMatchObject({
      code: "telegram_rate_limited",
      retryable: true,
      retryAfterSeconds: 7,
    });
  });
});
