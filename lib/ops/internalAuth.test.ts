import { describe, expect, it } from "vitest";
import { authorizeOpsInternalRequest, authorizeTelegramWebhookRequest } from "@/lib/ops/internalAuth";

describe("ops internal request authorization", () => {
  it("requires the configured token", () => {
    const request = new Request("https://talktheme.test/api/internal/ops");

    expect(authorizeOpsInternalRequest(request, {})).toEqual({
      ok: false,
      reason: "configuration_missing",
    });
    expect(authorizeOpsInternalRequest(request, { OPS_NOTIFICATIONS_DRAIN_TOKEN: "drain-token" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("accepts the exact token and rejects a prefix match", () => {
    const environment = { OPS_NOTIFICATIONS_DRAIN_TOKEN: "drain-token" };

    expect(authorizeOpsInternalRequest(
      new Request("https://talktheme.test/api/internal/ops", { headers: { "x-ops-notifications-token": "drain-token" } }),
      environment,
    )).toEqual({ ok: true });
    expect(authorizeOpsInternalRequest(
      new Request("https://talktheme.test/api/internal/ops", { headers: { "x-ops-notifications-token": "drain-token-extra" } }),
      environment,
    )).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("validates Telegram's secret-token header independently", () => {
    const environment = { TELEGRAM_WEBHOOK_SECRET: "webhook-secret_1" };
    const url = "https://talktheme.test/api/internal/ops/telegram/webhook";

    expect(authorizeTelegramWebhookRequest(new Request(url), {})).toEqual({
      ok: false,
      reason: "configuration_missing",
    });
    expect(authorizeTelegramWebhookRequest(new Request(url, {
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
    }), environment)).toEqual({ ok: false, reason: "unauthorized" });
    expect(authorizeTelegramWebhookRequest(new Request(url, {
      headers: { "x-telegram-bot-api-secret-token": "webhook-secret_1" },
    }), environment)).toEqual({ ok: true });
  });

  it("rejects a secret value outside Telegram's allowed format", () => {
    expect(authorizeTelegramWebhookRequest(
      new Request("https://talktheme.test"),
      { TELEGRAM_WEBHOOK_SECRET: "secret with spaces" },
    )).toEqual({ ok: false, reason: "configuration_invalid" });
  });
});
