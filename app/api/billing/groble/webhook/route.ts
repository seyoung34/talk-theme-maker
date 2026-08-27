import { NextResponse } from "next/server";
import {
  describeRejectedGroblePayload,
  grobleWebhookMaxBodyBytes,
  GrobleWebhookError,
  isRetryableGrobleWebhookError,
  parseGrobleWebhook,
  verifyGrobleWebhookSignature,
} from "@/lib/billing/groble";
import { processGrobleWebhookEvent, recordGrobleWebhookRejection } from "@/lib/billing/paymentRepository";
import { requireGrobleServerConfig } from "@/lib/supabase/config";

// No runtime declaration on purpose. @opennextjs/cloudflare does not support Next's "edge"
// runtime; the whole app already runs on workerd through the Node.js runtime with nodejs_compat.
// crypto.subtle and TextEncoder used below are available there.

// Names only, never values. A failed test delivery is often the only chance to learn which headers
// Groble actually sends, and header names carry no buyer data.
function listProviderHeaderNames(headers: Headers) {
  return [...headers.keys()].filter((name) => name.startsWith("x-")).sort().slice(0, 30);
}

async function quarantineDelivery(idempotencyKey: string, errorCode: string, rawBody: string) {
  try {
    await recordGrobleWebhookRejection({
      idempotencyKey,
      errorCode,
      description: describeRejectedGroblePayload(rawBody),
    });
  } catch (error) {
    console.error("Failed to record Groble webhook rejection", {
      errorCode,
      name: error instanceof Error ? error.name : "unknown",
    });
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ received: false, reason: "invalid_content_type" }, { status: 400 });
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > grobleWebhookMaxBodyBytes) {
    return NextResponse.json({ received: false, reason: "payload_too_large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > grobleWebhookMaxBodyBytes) {
    return NextResponse.json({ received: false, reason: "payload_too_large" }, { status: 413 });
  }
  const idempotencyKey = request.headers.get("x-groble-idempotency-key");
  if (!idempotencyKey || idempotencyKey.length > 256) {
    return NextResponse.json({ received: false, reason: "invalid_idempotency_key" }, { status: 400 });
  }

  let secrets: ReturnType<typeof requireGrobleServerConfig>;
  try {
    secrets = requireGrobleServerConfig();
  } catch {
    console.error("Failed to process Groble webhook", { configurationMissing: true });
    return NextResponse.json({ received: false, reason: "configuration_missing" }, { status: 500 });
  }

  try {
    await verifyGrobleWebhookSignature({
      rawBody,
      timestamp: request.headers.get("x-groble-timestamp"),
      signature: request.headers.get("x-groble-signature"),
      signaturePrevious: request.headers.get("x-groble-signature-previous"),
      secret: secrets.grobleWebhookSecret,
      previousSecret: secrets.grobleWebhookPreviousSecret,
    });
  } catch (error) {
    const code = error instanceof GrobleWebhookError ? error.code : "invalid_signature";
    console.warn("Rejected unauthenticated Groble webhook", {
      code,
      receivedHeaders: listProviderHeaderNames(request.headers),
    });
    return NextResponse.json({ received: false, reason: code }, { status: 401 });
  }

  // The delivery is authentic from here, so anything we refuse is quarantined rather than dropped.
  try {
    const event = parseGrobleWebhook(rawBody);
    const result = await processGrobleWebhookEvent(event, idempotencyKey);
    return NextResponse.json({ received: true, result: result?.result ?? "processed" });
  } catch (error) {
    if (error instanceof GrobleWebhookError) {
      await quarantineDelivery(idempotencyKey, error.code, rawBody);
      // A retryable code means our side is behind, not that the delivery was bad: answer 500 so
      // Groble keeps redelivering and a fix can still settle the payment.
      const retryable = isRetryableGrobleWebhookError(error.code);
      console.warn("Quarantined Groble webhook", { code: error.code, retryable });
      return NextResponse.json({ received: false, reason: error.code }, { status: retryable ? 500 : 400 });
    }
    console.error("Failed to process Groble webhook", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ received: false, reason: "temporary_failure" }, { status: 500 });
  }
}
