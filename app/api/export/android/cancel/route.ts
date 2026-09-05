import { NextResponse } from "next/server";
import {
  cancelExportJob,
  getCurrentUserOrNull,
} from "@/lib/billing/credits";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null) as { exportJobId?: unknown } | null;
  const exportJobId = typeof body?.exportJobId === "string" ? body.exportJobId : "";
  if (!uuidPattern.test(exportJobId)) {
    return NextResponse.json({ error: "exportJobId가 올바르지 않습니다.", reason: "invalid_job_id" }, { status: 400 });
  }

  try {
    const settlement = await cancelExportJob({
      userId: user.id,
      exportJobId,
      durationMs: 0,
    });
    if (settlement.transitioned) {
      return NextResponse.json({ status: "cancelled", refunded: true, balance: settlement.balance });
    }
    return settledCancellationResponse(settlement.status);
  } catch (error) {
    if (hasErrorMessage(error, "export_job_not_found")) {
      return NextResponse.json({ error: "내보내기 작업을 찾을 수 없습니다.", reason: "not_found" }, { status: 404 });
    }
    console.error("[export-cancel] failed", { exportJobId, name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "내보내기 취소를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", reason: "cancel_failed" }, { status: 503 });
  }
}

function settledCancellationResponse(status: "pending" | "succeeded" | "failed") {
  if (status === "succeeded") {
    return NextResponse.json({ status: "completed", cancelled: false, error: "이미 완료된 내보내기입니다." }, { status: 409 });
  }
  if (status === "failed") {
    return NextResponse.json({ status: "failed", cancelled: false, error: "이미 종료된 내보내기입니다." }, { status: 409 });
  }
  return NextResponse.json({ status: "cancelling", cancelled: true }, { status: 202 });
}

function hasErrorMessage(error: unknown, value: string) {
  return error instanceof Error && error.message.includes(value);
}
