export function readTelegramOperatorText(update: unknown, allowedChatId: string): string | null {
  if (!isRecord(update) || !isRecord(update.message)) return null;
  const message = update.message;
  if (!isRecord(message.chat) || message.chat.type !== "private") return null;
  const chatId = normalizeChatId(message.chat.id);
  if (!chatId || chatId !== allowedChatId.trim()) return null;
  if (typeof message.text !== "string" || message.text.length > 512) return null;
  return message.text;
}

/** Telegram retries a webhook update with the same id, so command handling must persist it. */
export function readTelegramUpdateId(update: unknown): number | null {
  if (!isRecord(update) || typeof update.update_id !== "number") return null;
  if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) return null;
  return update.update_id;
}

function normalizeChatId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return value.trim();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
