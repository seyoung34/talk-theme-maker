import { NextResponse } from "next/server";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";
import { createOpsDailySummaryEvent } from "@/lib/ops/eventFactories";
import { tryPublishOpsEvent } from "@/lib/ops/dispatcher";
import { getPreviousOpsDay, readOpsDailySummary, validateCompletedOpsDay } from "@/lib/ops/dailySummary";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authorizeOpsInternalRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "configuration_missing" ? "일일 요약이 설정되지 않았습니다." : "인증에 실패했습니다.", reason: auth.reason },
      { status: auth.reason === "configuration_missing" ? 503 : 401 },
    );
  }

  const requestedDay = new URL(request.url).searchParams.get("date");
  let day: string;
  if (requestedDay === null) {
    day = getPreviousOpsDay();
  } else {
    const validation = validateCompletedOpsDay(requestedDay.trim());
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.reason === "invalid_date"
            ? "일일 요약 날짜가 올바르지 않습니다."
            : "아직 종료되지 않은 날짜는 요약할 수 없습니다.",
          reason: validation.reason,
        },
        { status: 400 },
      );
    }
    day = validation.day;
  }

  try {
    const summary = await readOpsDailySummary(day);
    const event = createOpsDailySummaryEvent(summary);
    const publish = await tryPublishOpsEvent(event, { recoverDeadLetter: true });
    if (publish.status === "disabled") {
      return NextResponse.json({ error: "Telegram 알림이 비활성화되어 있습니다.", reason: "disabled" }, { status: 503 });
    }
    if (publish.status === "failed") {
      return NextResponse.json({ error: "일일 요약을 발송 대기열에 넣지 못했습니다.", reason: "publish_failed" }, { status: 502 });
    }

    // 운영자가 명시적으로 일일 요약을 재실행한 경우에만 dead-letter delivery를 복구한다.
    const drain = publish.status === "inserted" || publish.status === "duplicate"
      ? publish.drainResult
      : undefined;
    return NextResponse.json({
      day,
      summary,
      notification: {
        status: publish.status,
        ...(publish.status === "duplicate" ? { requeued: publish.requeued } : {}),
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
