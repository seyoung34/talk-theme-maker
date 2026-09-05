import { describe, expect, it } from "vitest";
import { readTelegramOperatorText, readTelegramUpdateId } from "@/lib/ops/telegramWebhook";

describe("Telegram operator update filter", () => {
  it("accepts only private messages from the configured chat", () => {
    expect(readTelegramOperatorText({
      update_id: 1,
      message: { chat: { id: 987654321, type: "private" }, text: "/status" },
    }, "987654321")).toBe("/status");
  });

  it("ignores another chat, group messages, and non-text updates", () => {
    expect(readTelegramOperatorText({ message: { chat: { id: 123, type: "private" }, text: "/status" } }, "987654321")).toBeNull();
    expect(readTelegramOperatorText({ message: { chat: { id: 987654321, type: "group" }, text: "/status" } }, "987654321")).toBeNull();
    expect(readTelegramOperatorText({ message: { chat: { id: 987654321, type: "private" }, photo: [] } }, "987654321")).toBeNull();
  });

  it("bounds command text before it reaches the parser", () => {
    expect(readTelegramOperatorText({
      message: { chat: { id: 987654321, type: "private" }, text: "/" + "a".repeat(512) },
    }, "987654321")).toBeNull();
  });

  it("accepts only Telegram's non-negative integer update id", () => {
    expect(readTelegramUpdateId({ update_id: 1 })).toBe(1);
    expect(readTelegramUpdateId({ update_id: -1 })).toBeNull();
    expect(readTelegramUpdateId({ update_id: "1" })).toBeNull();
    expect(readTelegramUpdateId({})).toBeNull();
  });
});
