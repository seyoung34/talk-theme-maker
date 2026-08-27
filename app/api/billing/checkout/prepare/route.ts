import { NextResponse } from "next/server";
import { getCurrentUserOrNull, isBillingHoldError } from "@/lib/billing/credits";
import { getCreditProduct } from "@/lib/billing/products";
import { prepareGroblePayment } from "@/lib/billing/paymentRepository";
import { isGrobleCheckoutEnabled } from "@/lib/supabase/config";

type PrepareBody = { productId?: string };

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
  }
  if (!isGrobleCheckoutEnabled()) {
    return NextResponse.json(
      { error: "결제 기능을 준비하고 있습니다.", reason: "checkout_temporarily_disabled" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as PrepareBody;
  const product = getCreditProduct(body.productId);
  if (!product) {
    return NextResponse.json({ error: "충전 상품을 선택해 주세요.", reason: "invalid_product" }, { status: 400 });
  }

  try {
    return NextResponse.json(await prepareGroblePayment({ userId: user.id, productId: product.id }));
  } catch (error) {
    if (isBillingHoldError(error)) {
      return NextResponse.json(
        { error: "환불 조정 중인 계정입니다.", reason: "billing_hold" },
        { status: 409 },
      );
    }
    console.error("Failed to prepare Groble checkout", error);
    return NextResponse.json(
      { error: "결제 요청을 준비하지 못했습니다.", reason: "checkout_prepare_failed" },
      { status: 500 },
    );
  }
}
