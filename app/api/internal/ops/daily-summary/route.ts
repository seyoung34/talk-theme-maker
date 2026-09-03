import { NextResponse } from "next/server";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";
import { createOpsDailySummaryEvent } from "@/lib/ops/eventFactories";
import { drainTelegramNotifications, tryPublishOpsEvent } from "@/lib/ops/dispatcher";
import { getPreviousOpsDay, readOpsDailySummary } from "@/lib/ops/dailySummary";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeOpsInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "configuration_missing" ? "일일 요약이 설정되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: auth.reason === "configuration_missing" ? 503 : 401 },
    );
  }

  const requestedDay = new URL(request.url).searchParams.get("date")?.trim();
  const day = requestedDay || getPreviousOpsDay();

  try {
    const summary = await readOpsDailySummary(day);
    const event = createOpsDailySummaryEvent(summary);
    const publish = await tryPublishOpsEvent(event);
    if (publish.status === "disabled") {
      return NextResponse.json({ error: "Telegram 알림이 비활성화되어 있습니다.", reason: "disabled" }, { status: 503 });
    }
    if (publish.status === "failed") {
      return NextResponse.json({ error: "일일 요약을 발송 대기열에 넣지 못했습니다.", reason: "publish_failed" }, { status: 502 });
    }

    // 이미 생성된 동일 날짜 이벤트를 재실행하는 경우에도 남아 있는 delivery를 회수한다.
    const drain = publish.status === "duplicate"
      ? await drainTelegramNotifications({ limit: 20 })
      : publish.drainResult;
    return NextResponse.json({
      day,
      summary,
      notification: {
        status: publish.status,
        ...(drain ? { drain } : {}),
      },
    });
  } catch (error) {
    console.error("[ops-daily-summary] failed", {
      day,
      errorCode: error instanceof Error ? error.name.slice(0, 80) : "unknown_error",
    });
    return NextResponse.json({ error: "일일 운영 요약을 생성하지 못했습니다.", reason: "summary_failed" }, { status: 500 });
  }
}
