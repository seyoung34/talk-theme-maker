import { NextResponse } from "next/server";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";
import { drainTelegramNotifications } from "@/lib/ops/dispatcher";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeOpsInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "configuration_missing" ? "운영 알림 drain이 설정되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: auth.reason === "configuration_missing" ? 503 : 401 },
    );
  }

  try {
    const result = await drainTelegramNotifications({ limit: 20 });
    if (result.status === "disabled") {
      return NextResponse.json({ error: "Telegram 알림이 비활성화되어 있습니다.", reason: "disabled" }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ops-notification] drain_failed", {
      errorCode: error instanceof Error ? error.name.slice(0, 80) : "unknown_error",
    });
    return NextResponse.json({ error: "운영 알림을 처리하지 못했습니다.", reason: "drain_failed" }, { status: 500 });
  }
}
