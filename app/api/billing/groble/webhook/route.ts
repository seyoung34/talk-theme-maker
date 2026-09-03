import { NextResponse } from "next/server";
import {
  createGrobleWebhookRejectedEvent,
  createGrobleWebhookTemporaryFailureEvent,
} from "@/lib/ops/eventFactories";
import { scheduleOpsEvent } from "@/lib/ops/dispatcher";
import {
  describeRejectedGroblePayload,
  grobleWebhookMaxBodyBytes,
  GrobleWebhookError,
  isRetryableGrobleWebhookError,
  parseGrobleWebhook,
  type ParsedGrobleEvent,
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
  const description = describeRejectedGroblePayload(rawBody);
  try {
    await recordGrobleWebhookRejection({
      idempotencyKey,
      errorCode,
      description,
    });
  } catch (error) {
    console.error("Failed to record Groble webhook rejection", {
      errorCode,
      name: error instanceof Error ? error.name : "unknown",
    });
  }
  return description;
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ received: false, reason: "invalid_content_type" }, { status: 400 });
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > grobleWebhookMaxBodyBytes) {
    return NextResponse.json({ received: false, reason: "payload_too_large" }, { status: 413 });
  }

  const rawBodyBytes = new Uint8Array(await request.arrayBuffer());
  if (rawBodyBytes.byteLength > grobleWebhookMaxBodyBytes) {
    return NextResponse.json({ received: false, reason: "payload_too_large" }, { status: 413 });
  }
  const rawBody = new TextDecoder().decode(rawBodyBytes);
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
      rawBody: rawBodyBytes,
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
  let parsedEvent: ParsedGrobleEvent | null = null;
  try {
    const event = parseGrobleWebhook(rawBody);
    parsedEvent = event;
    const result = await processGrobleWebhookEvent(event, idempotencyKey);
    return NextResponse.json({ received: true, result: result?.result ?? "processed" });
  } catch (error) {
    if (error instanceof GrobleWebhookError) {
      const description = await quarantineDelivery(idempotencyKey, error.code, rawBody);
      scheduleOpsEvent(createGrobleWebhookRejectedEvent({
        errorCode: error.code,
        eventId: description.eventId,
        eventType: description.eventType,
        occurredAt: description.occurredAt,
      }));
      // A retryable code means our side is behind, not that the delivery was bad: answer 500 so
      // Groble keeps redelivering and a fix can still settle the payment.
      const retryable = isRetryableGrobleWebhookError(error.code);
      // The parser error only contains a field path and is safe to log. It makes a provider
      // schema drift diagnosable without logging the signed body or buyer data.
      console.warn("Quarantined Groble webhook", { code: error.code, retryable, detail: error.message });
      return NextResponse.json({ received: false, reason: error.code }, { status: retryable ? 500 : 400 });
    }
    scheduleOpsEvent(createGrobleWebhookTemporaryFailureEvent({
      eventId: parsedEvent?.eventId ?? null,
      eventType: parsedEvent?.eventType ?? null,
      errorCode: error instanceof Error ? error.name : "unknown_error",
      occurredAt: parsedEvent?.occurredAt ?? null,
    }));
    console.error("Failed to process Groble webhook", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ received: false, reason: "temporary_failure" }, { status: 500 });
  }
}
