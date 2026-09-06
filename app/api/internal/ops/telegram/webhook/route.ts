import { NextResponse } from "next/server";
import { getOpsCommandReply, parseOpsTelegramCommand } from "@/lib/ops/commands";
import { authorizeTelegramWebhookRequest } from "@/lib/ops/internalAuth";
import {
  acknowledgeOpsTelegramCommandUpdate,
  claimOpsTelegramCommandUpdate,
  markOpsTelegramCommandUpdateSent,
  releaseOpsTelegramCommandUpdate,
} from "@/lib/ops/repository";
import { readTelegramOperatorText, readTelegramUpdateId } from "@/lib/ops/telegramWebhook";
import { isTelegramNotificationsEnabled, readTelegramConfig, sendTelegramMessage, TelegramError } from "@/lib/ops/telegram";

const maxWebhookBodyBytes = 64 * 1024;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Telegram retries non-2xx webhook responses. A disabled bot has no work to do, so
  // acknowledge the update before checking secrets or reading the request body.
  if (!isTelegramNotificationsEnabled()) {
    return NextResponse.json({ ok: true, ignored: "disabled" });
  }

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

  const updateId = readTelegramUpdateId(update);
  if (updateId === null) {
    return NextResponse.json({ error: "Telegram update_id가 올바르지 않습니다.", reason: "invalid_update_id" }, { status: 400 });
  }

  let claim;
  try {
    claim = await claimOpsTelegramCommandUpdate(updateId);
  } catch (error) {
    console.error("[telegram-webhook] update_claim_failed", {
      updateId,
      command: parsed.name,
      name: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "Telegram 명령을 접수하지 못했습니다.", reason: "command_claim_failed" }, { status: 503 });
  }
  if (claim !== "claimed") {
    return NextResponse.json({ ok: true, command: parsed.name, duplicate: true, state: claim });
  }

  let providerMessageId: string | null;
  try {
    const reply = await getOpsCommandReply(parsed, { telegramStatus: "configured" });
    const result = await sendTelegramMessage(config, reply);
    providerMessageId = result.providerMessageId;
  } catch (error) {
    console.error("[telegram-webhook] command_failed", {
      command: parsed.name,
      errorCode: error instanceof TelegramError ? error.code : "unknown_error",
      retryable: error instanceof TelegramError ? error.retryable : undefined,
    });
    if (error instanceof TelegramError && !error.retryable) {
      try {
        await acknowledgeOpsTelegramCommandUpdate({ updateId, reason: error.code });
        return NextResponse.json({ ok: true, acknowledged: true, reason: "permanent_provider_failure" });
      } catch (acknowledgementError) {
        console.error("[telegram-webhook] permanent_failure_acknowledgement_failed", {
          updateId,
          command: parsed.name,
          name: acknowledgementError instanceof Error ? acknowledgementError.name : "unknown_error",
        });
        return NextResponse.json({ error: "Telegram 명령 처리 상태를 기록하지 못했습니다.", reason: "command_record_failed" }, { status: 503 });
      }
    }
    try {
      await releaseOpsTelegramCommandUpdate(updateId);
    } catch (releaseError) {
      console.error("[telegram-webhook] retry_release_failed", {
        updateId,
        command: parsed.name,
        name: releaseError instanceof Error ? releaseError.name : "unknown_error",
      });
      return NextResponse.json({ error: "Telegram 명령 재시도 상태를 기록하지 못했습니다.", reason: "command_record_failed" }, { status: 503 });
    }
    return NextResponse.json({ error: "Telegram 명령을 처리하지 못했습니다.", reason: "command_failed" }, { status: 502 });
  }

  // Do not release the claim after Telegram accepted the reply: a lost HTTP
  // response must not make the same update send a second operator message.
  try {
    const recorded = await markOpsTelegramCommandUpdateSent({ updateId, providerMessageId });
    if (!recorded) {
      console.error("[telegram-webhook] sent_reply_not_recorded", { updateId, command: parsed.name });
      return NextResponse.json({ error: "Telegram 명령 응답을 기록하지 못했습니다.", reason: "command_record_failed" }, { status: 503 });
    }
  } catch (error) {
    console.error("[telegram-webhook] sent_reply_record_failed", {
      updateId,
      command: parsed.name,
      name: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "Telegram 명령 응답을 기록하지 못했습니다.", reason: "command_record_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, command: parsed.name, providerMessageId });
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
