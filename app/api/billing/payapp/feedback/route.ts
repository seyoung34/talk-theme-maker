import { NextResponse } from "next/server";
import { payappFormDataToRecord } from "@/lib/billing/payapp";
import { timingSafeEqualStrings } from "@/lib/security/timingSafe";
import { requirePayappServerConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/server";

const paidState = "4";
const canceledStates = new Set(["8", "16", "31", "32", "9", "64", "70", "71"]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const payload = payappFormDataToRecord(formData);
  const admin = createAdminClient();

  let config: ReturnType<typeof requirePayappServerConfig>;
  try {
    config = requirePayappServerConfig();
  } catch {
    return new NextResponse("FAIL", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const paymentId = payload.var1; //payments테이블 row uuid
  const orderId = payload.var2; //payments테이블 주문번호 order_id
  const hasRequiredIds = Boolean(paymentId) && Boolean(orderId);
  const isTrusted =
    hasRequiredIds &&
    timingSafeEqualStrings(payload.userid ?? "", config.payappUserId) &&
    timingSafeEqualStrings(payload.linkkey ?? "", config.payappLinkKey) &&
    timingSafeEqualStrings(payload.linkval ?? "", config.payappLinkValue);

  if (!isTrusted) {
    return new NextResponse("FAIL", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { data: payment, error } = await admin.from("payments").select("id,order_id,amount,status").eq("id", paymentId).eq("order_id", orderId).maybeSingle();
  if (error || !payment) {
    return new NextResponse("FAIL", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (String(payment.amount) !== String(payload.price)) {
    await admin.from("payments").update({ status: "failed", raw_payload: payload }).eq("id", payment.id);
    return new NextResponse("FAIL", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (payload.pay_state === paidState) {
    await admin
      .from("payments")
      .update({
        provider: "payapp",
        provider_payment_id: payload.mul_no || null,
        checkout_url: payload.payurl || null,
        receipt_url: payload.csturl || null,
        raw_payload: payload,
      })
      .eq("id", payment.id);

    const { error: rpcError } = await admin.rpc("complete_credit_purchase", {
      p_payment_id: payment.id,
      p_reason: "payapp_credit_purchase",
    });
    if (rpcError) {
      return new NextResponse("FAIL", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return successResponse();
  }

  if (canceledStates.has(payload.pay_state)) {
    await admin
      .from("payments")
      .update({
        status: payment.status === "paid" ? "paid" : "canceled",
        provider: "payapp",
        provider_payment_id: payload.mul_no || null,
        checkout_url: payload.payurl || null,
        receipt_url: payload.csturl || null,
        raw_payload: payload,
      })
      .eq("id", payment.id);
    return successResponse();
  }

  await admin.from("payments").update({ raw_payload: payload }).eq("id", payment.id);
  return successResponse();
}

function successResponse() {
  return new NextResponse("SUCCESS", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
