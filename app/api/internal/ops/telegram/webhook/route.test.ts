import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/ops/telegram/webhook/route";

const mocks = vi.hoisted(() => ({
  getOpsCommandReply: vi.fn(),
  readTelegramConfig: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/ops/commands", () => ({
  getOpsCommandReply: mocks.getOpsCommandReply,
  parseOpsTelegramCommand: vi.fn((text: string) => {
    if (!text.trim().startsWith("/")) return null;
    const command = text.trim().slice(1).split(/\s+/)[0]?.split("@")[0];
    return command ? { name: command, args: [] } : null;
  }),
}));

vi.mock("@/lib/ops/telegram", () => ({
  TelegramError: class TelegramError extends Error {},
  readTelegramConfig: mocks.readTelegramConfig,
  sendTelegramMessage: mocks.sendTelegramMessage,
}));

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret");
  mocks.readTelegramConfig.mockReset().mockReturnValue({
    botToken: "123456789:abcdefghijklmnopqrst",
    chatId: "987654321",
  });
  mocks.getOpsCommandReply.mockReset().mockResolvedValue("상태 응답");
  mocks.sendTelegramMessage.mockReset().mockResolvedValue({ providerMessageId: "42" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(body: unknown, secret = "webhook-secret") {
  return new Request("https://talktheme.test/api/internal/ops/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(body),
  });
}

describe("Telegram webhook route", () => {
  it("rejects an invalid Telegram secret before reading the update", async () => {
    const response = await POST(request({ message: {} }, "wrong"));
    expect(response.status).toBe(401);
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("ignores messages outside the configured private operator chat", async () => {
    const response = await POST(request({
      message: { chat: { id: 123, type: "private" }, text: "/status" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ignored: "not_operator_message" });
    expect(mocks.getOpsCommandReply).not.toHaveBeenCalled();
  });

  it("executes a command and replies to the same operator chat", async () => {
    const response = await POST(request({
      update_id: 1,
      message: { chat: { id: 987654321, type: "private" }, text: "/status" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, command: "status", providerMessageId: "42" });
    expect(mocks.getOpsCommandReply).toHaveBeenCalledWith({ name: "status", args: [] }, { telegramStatus: "configured" });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "987654321" }),
      "상태 응답",
    );
  });

  it("ignores ordinary text instead of treating it as an operator action", async () => {
    const response = await POST(request({
      message: { chat: { id: 987654321, type: "private" }, text: "안녕하세요" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ignored: "not_command" });
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });
});
