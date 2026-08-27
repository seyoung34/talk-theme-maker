import { createGrobleCheckoutUrl, type ParsedGrobleEvent } from "@/lib/billing/groble";
import { getCreditProduct, type CreditProductId } from "@/lib/billing/products";
import { createAdminClient } from "@/lib/supabase/server";

const pendingCheckoutReuseMs = 10 * 60 * 1000;

export async function prepareGroblePayment(input: { userId: string; productId: CreditProductId }) {
  const product = getCreditProduct(input.productId);
  if (!product) throw new Error("invalid_product");
  const admin = createAdminClient();
  const reusableAfter = new Date(Date.now() - pendingCheckoutReuseMs).toISOString();
  const { data: existing, error: existingError } = await admin
    .from("payments")
    .select("id,checkout_url,amount,credits")
    .eq("user_id", input.userId)
    .eq("provider", "groble")
    .eq("product_id", product.id)
    .eq("status", "pending")
    .gte("created_at", reusableAfter)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.checkout_url) {
    return {
      paymentId: existing.id,
      checkoutUrl: existing.checkout_url,
      amount: existing.amount,
      credits: existing.credits,
    };
  }

  const paymentId = crypto.randomUUID();
  const checkoutUrl = createGrobleCheckoutUrl(product, paymentId);
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      id: paymentId,
      user_id: input.userId,
      provider: "groble",
      order_id: `groble-${paymentId}`,
      product_id: product.id,
      seller_reference: paymentId,
      provider_content_id: product.groble.contentId,
      provider_option_id: product.groble.optionId,
      amount: product.amount,
      credits: product.credits,
      status: "pending",
      checkout_url: checkoutUrl,
    })
    .select("id,checkout_url,amount,credits")
    .single();
  if (error) throw error;
  return {
    paymentId: payment.id,
    checkoutUrl: payment.checkout_url,
    amount: payment.amount,
    credits: payment.credits,
  };
}

export async function getOwnedPaymentStatus(userId: string, paymentId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payments")
    .select("id,amount,credits,status,refund_status,analytics_transaction_id")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function processGrobleWebhookEvent(event: ParsedGrobleEvent, idempotencyKey: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_groble_webhook_event", {
    p_event_id: event.eventId,
    p_idempotency_key: idempotencyKey,
    p_event_type: event.eventType,
    p_occurred_at: event.occurredAt,
    p_payment_id: event.paymentId,
    p_merchant_uid: event.merchantUid,
    p_seller_reference: event.sellerReference,
    p_product_id: event.productId,
    p_content_id: event.contentId,
    p_option_id: event.optionId,
    p_amount: event.amount,
    p_refund_amount: event.refundAmount,
    p_partial_refund: event.partialRefund,
    p_action_at: event.actionAt,
    p_sanitized_payload: event.sanitizedPayload,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
