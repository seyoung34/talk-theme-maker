import { withRequestObservation, setObservationStage, recordOperationFailure } from "@/lib/ops/requestObservation";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserOrNull } from "@/lib/billing/credits";
import { getOwnedPaymentStatus } from "@/lib/billing/paymentRepository";

export async function GET(request: NextRequest) {
  return withRequestObservation(request, "/api/billing/payments/status", "billing.status", () => handleRequest(request));
}

async function handleRequest(request: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
  }
  const paymentId = request.nextUrl.searchParams.get("paymentId");
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId가 필요합니다.", reason: "missing_payment_id" }, { status: 400 });
  }

  try {
    setObservationStage("result_read", "database");
    const payment = await getOwnedPaymentStatus(user.id, paymentId);
    if (!payment) {
      return NextResponse.json({ error: "결제 요청을 찾을 수 없습니다.", reason: "payment_not_found" }, { status: 404 });
    }
    return NextResponse.json({ payment });
  } catch {
    recordOperationFailure("result_read_failed", 500);
    return NextResponse.json({ error: "결제 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}
