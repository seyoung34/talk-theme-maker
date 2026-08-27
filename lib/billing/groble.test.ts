import { describe, expect, it } from "vitest";
import {
  createGrobleCheckoutUrl,
  describeRejectedGroblePayload,
  GrobleWebhookError,
  isRetryableGrobleWebhookError,
  parseGrobleWebhook,
  verifyGrobleWebhookSignature,
} from "@/lib/billing/groble";
import { creditProducts } from "@/lib/billing/products";

const paymentId = "90df4ea9-dd9f-4f5a-91cc-b4c09344f96a";

function completedPayload() {
  return {
    id: "evt_live_1",
    type: "payment.completed",
    version: "2026-04-30",
    occurredAt: "2026-08-28T10:00:00+09:00",
    data: {
      object: {
        merchantUid: "merchant-1",
        sellerReference: paymentId,
        buyer: { email: "must-not-be-saved@example.com", phoneNumber: "01012345678" },
        content: { id: "u9xtdR", title: "크레딧 2개", paymentType: "ONE_TIME", inputMode: "PAYMENT_WINDOW" },
        options: [{ optionId: "9362", name: "기본 옵션", quantity: 1, subtotal: 5000 }],
        pricing: { currency: "KRW", finalAmount: 5000 },
      },
    },
  };
}

async function signature(secret: string, timestamp: string, rawBody: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("Groble billing", () => {
  it("creates an allowlisted checkout URL with an opaque payment UUID", () => {
    expect(createGrobleCheckoutUrl(creditProducts[1], paymentId)).toBe(
      `https://www.groble.im/payment/u9xtdR?ref=${paymentId}`,
    );
  });

  it("parses a supported event and strips buyer PII", () => {
    const event = parseGrobleWebhook(JSON.stringify(completedPayload()));

    expect(event).toMatchObject({
      eventType: "payment.completed",
      paymentId,
      productId: "credit-2",
      optionId: "9362",
      amount: 5000,
    });
    expect(JSON.stringify(event.sanitizedPayload)).not.toContain("must-not-be-saved");
    expect(JSON.stringify(event.sanitizedPayload)).not.toContain("01012345678");
  });

  it("rejects a live event whose amount does not match the registered product", () => {
    const payload = completedPayload();
    payload.data.object.pricing.finalAmount = 3000;
    payload.data.object.options[0].subtotal = 3000;
    expect(() => parseGrobleWebhook(JSON.stringify(payload))).toThrowError(GrobleWebhookError);
  });

  it("fails closed when Groble changes the webhook schema version", () => {
    const payload = completedPayload();
    payload.version = "2099-01-01";
    expect(() => parseGrobleWebhook(JSON.stringify(payload))).toThrowError(
      expect.objectContaining({ code: "unsupported_version" }),
    );
  });

  it("accepts Groble's synthetic test event without treating it as a real payment", () => {
    const payload = completedPayload();
    payload.id = "evt_test_a1b2c3";
    payload.data.object.sellerReference = "usr_sample_42";
    payload.data.object.content.id = "test_content_0001";
    payload.data.object.content.inputMode = "NORMAL";
    payload.data.object.options[0].optionId = "test_option_0001";

    expect(parseGrobleWebhook(JSON.stringify(payload))).toMatchObject({
      eventId: "evt_test_a1b2c3",
      paymentId: null,
      productId: null,
    });
  });

  it("verifies the raw-body HMAC and timestamp window", async () => {
    const rawBody = JSON.stringify(completedPayload());
    const timestamp = "1787860800";
    const secret = "test-secret";

    await expect(verifyGrobleWebhookSignature({
      rawBody,
      timestamp,
      signature: await signature(secret, timestamp, rawBody),
      signaturePrevious: null,
      secret,
      now: Number(timestamp) * 1000,
    })).resolves.toBeUndefined();

    await expect(verifyGrobleWebhookSignature({
      rawBody,
      timestamp,
      signature: "0".repeat(64),
      signaturePrevious: null,
      secret,
      now: Number(timestamp) * 1000,
    })).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("accepts the previous secret only through the rotation signature header", async () => {
    const rawBody = JSON.stringify(completedPayload());
    const timestamp = "1787860800";
    const previousSecret = "previous-secret";

    await expect(verifyGrobleWebhookSignature({
      rawBody,
      timestamp,
      signature: "0".repeat(64),
      signaturePrevious: await signature(previousSecret, timestamp, rawBody),
      secret: "current-secret",
      previousSecret,
      now: Number(timestamp) * 1000,
    })).resolves.toBeUndefined();
  });

  it("describes a rejected payload by structure without copying any value", () => {
    const description = describeRejectedGroblePayload(JSON.stringify(completedPayload()));

    expect(description).toMatchObject({
      eventId: "evt_live_1",
      eventType: "payment.completed",
      schemaVersion: "2026-04-30",
      occurredAt: "2026-08-28T10:00:00+09:00",
    });
    const shape = JSON.stringify(description.payloadShape);
    expect(shape).not.toContain("must-not-be-saved");
    expect(shape).not.toContain("01012345678");
    expect(shape).not.toContain("merchant-1");
    // Key names survive so a schema drift is diagnosable from the quarantine row alone.
    expect(shape).toContain("sellerReference");
    expect(description.payloadShape).toMatchObject({ id: "string", data: { object: { pricing: { finalAmount: "number" } } } });
  });

  it("describes an unparsable body without throwing", () => {
    expect(describeRejectedGroblePayload("<html>gateway error</html>")).toEqual({
      eventId: null,
      eventType: null,
      schemaVersion: null,
      occurredAt: null,
      payloadShape: { parse: "invalid_json" },
    });
  });

  it("asks for redelivery only when a deploy could still settle the same payload", () => {
    expect(isRetryableGrobleWebhookError("unsupported_version")).toBe(true);
    expect(isRetryableGrobleWebhookError("unknown_product")).toBe(true);
    expect(isRetryableGrobleWebhookError("invalid_amount")).toBe(true);
    expect(isRetryableGrobleWebhookError("invalid_json")).toBe(false);
    expect(isRetryableGrobleWebhookError("invalid_payload")).toBe(false);
    // A buyer can strip ?ref, and we never sell subscriptions: redelivery cannot change either.
    expect(isRetryableGrobleWebhookError("invalid_reference")).toBe(false);
    expect(isRetryableGrobleWebhookError("unsupported_event")).toBe(false);
  });

  it("rejects a valid signature outside the five-minute replay window", async () => {
    const rawBody = JSON.stringify(completedPayload());
    const timestamp = "1787860800";
    const secret = "test-secret";

    await expect(verifyGrobleWebhookSignature({
      rawBody,
      timestamp,
      signature: await signature(secret, timestamp, rawBody),
      signaturePrevious: null,
      secret,
      now: (Number(timestamp) + 301) * 1000,
    })).rejects.toMatchObject({ code: "invalid_timestamp" });
  });
});
