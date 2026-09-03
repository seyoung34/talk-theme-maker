import { NextResponse } from "next/server";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";
import { formatTelegramTestMessage } from "@/lib/ops/formatters";
import { readTelegramConfig, sendTelegramMessage, TelegramError } from "@/lib/ops/telegram";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeOpsInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "configuration_missing" ? "운영 알림 테스트가 설정되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: auth.reason === "configuration_missing" ? 503 : 401 },
    );
  }

  try {
    const config = readTelegramConfig();
    if (!config) {
      return NextResponse.json({ error: "Telegram 알림이 비활성화되어 있습니다.", reason: "disabled" }, { status: 503 });
    }
    const result = await sendTelegramMessage(
      config,
      formatTelegramTestMessage({ environment: process.env.NODE_ENV }),
    );
    return NextResponse.json({ sent: true, providerMessageId: result.providerMessageId });
  } catch (error) {
    console.error("[ops-notification] test_failed", {
      errorCode: error instanceof TelegramError ? error.code : "unknown_error",
    });
    return NextResponse.json({ error: "Telegram 테스트 메시지를 보내지 못했습니다.", reason: "test_failed" }, { status: 502 });
  }
}
