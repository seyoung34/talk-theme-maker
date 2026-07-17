import { NextResponse } from "next/server";
import { createPayappCreditCheckout, isValidKoreanPhone, sanitizePayappError, sanitizePayappPayload } from "@/lib/billing/payapp";
import { getSafeBillingReturnTo } from "@/lib/billing/returnTo";
import { getCurrentUserOrNull } from "@/lib/billing/credits";
import { getCreditProduct } from "@/lib/billing/products";
import { createAdminClient } from "@/lib/supabase/server";

type PrepareBody = { phone?: string; productId?: string; returnTo?: string };

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as PrepareBody;
  const product = getCreditProduct(body.productId);
  if (!product) return NextResponse.json({ error: "충전 상품을 선택해 주세요.", reason: "invalid_product" }, { status: 400 });
  if (!body.phone || !isValidKoreanPhone(body.phone)) return NextResponse.json({ error: "휴대폰번호를 정확히 입력해 주세요.", reason: "invalid_phone" }, { status: 400 });

  const admin = createAdminClient();
  const orderId = `${product.id}-${Date.now()}-${crypto.randomUUID()}`;
  const { data: payment, error } = await admin
    .from("payments")
    .insert({ user_id: user.id, provider: "payapp", order_id: orderId, amount: product.amount, credits: product.credits, status: "pending" })
    .select("id,order_id,amount,credits")
    .single();
  if (error) throw error;

  try {
    const checkout = await createPayappCreditCheckout({ paymentId: payment.id, orderId: payment.order_id, phone: body.phone, product, returnTo: getSafeBillingReturnTo(body.returnTo) });
    const { error: updateError } = await admin.from("payments").update({ provider_payment_id: checkout.providerPaymentId, checkout_url: checkout.checkoutUrl, receipt_url: checkout.receiptUrl, raw_payload: sanitizePayappPayload(checkout.raw) }).eq("id", payment.id);
    if (updateError) throw updateError;
    return NextResponse.json({ paymentId: payment.id, checkoutUrl: checkout.checkoutUrl, amount: payment.amount, credits: payment.credits });
  } catch (error) {
    const raw = typeof error === "object" && error && "raw" in error ? (error as { raw?: unknown }).raw : null;
    await admin.from("payments").update({ status: "failed", raw_payload: sanitizePayappError(raw ?? error) }).eq("id", payment.id);
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("PayApp server configuration is missing") ? 503 : 400;
    return NextResponse.json(
      {
        error: status === 503 ? "PayApp 환경변수가 설정되지 않았습니다." : "PayApp 결제 요청에 실패했습니다.",
        reason: status === 503 ? "payapp_config_missing" : "payapp_prepare_failed",
      },
      { status },
    );
  }
}
