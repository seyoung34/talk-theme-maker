import { NextResponse } from "next/server";
import { getOpsCommandReply, parseOpsTelegramCommand } from "@/lib/ops/commands";
import { authorizeTelegramWebhookRequest } from "@/lib/ops/internalAuth";
import { readTelegramOperatorText } from "@/lib/ops/telegramWebhook";
import { readTelegramConfig, sendTelegramMessage, TelegramError } from "@/lib/ops/telegram";

const maxWebhookBodyBytes = 64 * 1024;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeTelegramWebhookRequest(request);
  if (!auth.ok) {
    const configurationFailure = auth.reason === "configuration_missing" || auth.reason === "configuration_invalid";
    return NextResponse.json(
      { error: configurationFailure ? "Telegram webhook 설정이 완료되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: configurationFailure ? 503 : 401 },
    );
  }

  let config;
  try {
    config = readTelegramConfig();
  } catch (error) {
    console.error("[telegram-webhook] configuration_failed", {
      errorCode: error instanceof TelegramError ? error.code : "unknown_error",
    });
    return NextResponse.json({ error: "Telegram 설정을 확인할 수 없습니다.", reason: "configuration_failed" }, { status: 503 });
  }
  if (!config) {
    return NextResponse.json({ error: "Telegram 알림이 비활성화되어 있습니다.", reason: "disabled" }, { status: 503 });
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) {
    return NextResponse.json({ error: "요청 본문이 너무 큽니다.", reason: "body_too_large" }, { status: 413 });
  }

  let update: unknown;
  try {
    update = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "요청 본문 형식이 올바르지 않습니다.", reason: "invalid_json" }, { status: 400 });
  }

  const text = readTelegramOperatorText(update, config.chatId);
  if (text === null) return NextResponse.json({ ok: true, ignored: "not_operator_message" });

  const parsed = parseOpsTelegramCommand(text);
  if (parsed === null) return NextResponse.json({ ok: true, ignored: "not_command" });

  try {
    const reply = await getOpsCommandReply(parsed, { telegramStatus: "configured" });
    const result = await sendTelegramMessage(config, reply);
    return NextResponse.json({ ok: true, command: parsed.name, providerMessageId: result.providerMessageId });
  } catch (error) {
    console.error("[telegram-webhook] command_failed", {
      command: parsed.name,
      errorCode: error instanceof TelegramError ? error.code : "unknown_error",
    });
    return NextResponse.json({ error: "Telegram 명령을 처리하지 못했습니다.", reason: "command_failed" }, { status: 502 });
  }
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength > maxWebhookBodyBytes) return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      totalBytes += chunk.byteLength;
      if (totalBytes > maxWebhookBodyBytes) return null;
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
