import { NextResponse } from "next/server";
import {
  grobleWebhookMaxBodyBytes,
  GrobleWebhookError,
  parseGrobleWebhook,
  verifyGrobleWebhookSignature,
} from "@/lib/billing/groble";
import { processGrobleWebhookEvent } from "@/lib/billing/paymentRepository";
import { requireGrobleServerConfig } from "@/lib/supabase/config";

export const runtime = "edge";

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

  try {
    const { grobleWebhookSecret, grobleWebhookPreviousSecret } = requireGrobleServerConfig();
    await verifyGrobleWebhookSignature({
      rawBody,
      timestamp: request.headers.get("x-groble-timestamp"),
      signature: request.headers.get("x-groble-signature"),
      signaturePrevious: request.headers.get("x-groble-signature-previous"),
      secret: grobleWebhookSecret,
      previousSecret: grobleWebhookPreviousSecret,
    });
    const event = parseGrobleWebhook(rawBody);
    const result = await processGrobleWebhookEvent(event, idempotencyKey);
    return NextResponse.json({ received: true, result: result?.result ?? "processed" });
  } catch (error) {
    if (error instanceof GrobleWebhookError) {
      const status = error.code === "invalid_signature" || error.code === "missing_signature" || error.code === "invalid_timestamp" ? 401 : 400;
      console.warn("Rejected Groble webhook", { code: error.code });
      return NextResponse.json({ received: false, reason: error.code }, { status });
    }
    const configurationMissing = error instanceof Error && error.message.includes("Groble server configuration is missing");
    console.error("Failed to process Groble webhook", { configurationMissing, name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json(
      { received: false, reason: configurationMissing ? "configuration_missing" : "temporary_failure" },
      { status: 500 },
    );
  }
}
