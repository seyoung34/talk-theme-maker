import { getCreditProductByGroble, type CreditProduct } from "@/lib/billing/products";

export const grobleWebhookMaxBodyBytes = 256 * 1024;
export const grobleWebhookTimestampToleranceSeconds = 5 * 60;
export const grobleWebhookSchemaVersion = "2026-04-30";

const supportedEventTypes = [
  "payment.completed",
  "payment.cancel_requested",
  "payment.refunded",
] as const;

export type GrobleEventType = (typeof supportedEventTypes)[number];

export type ParsedGrobleEvent = {
  eventId: string;
  eventType: GrobleEventType;
  version: string;
  occurredAt: string;
  paymentId: string | null;
  merchantUid: string;
  sellerReference: string | null;
  productId: CreditProduct["id"] | null;
  contentId: string;
  optionId: string;
  amount: number;
  refundAmount: number | null;
  partialRefund: boolean | null;
  actionAt: string | null;
  sanitizedPayload: Record<string, unknown>;
};

export class GrobleWebhookError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GrobleWebhookError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) throw new GrobleWebhookError("invalid_payload", `${field} must be an object`);
  return value;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new GrobleWebhookError("invalid_payload", `${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new GrobleWebhookError("invalid_payload", `${field} must be a positive integer`);
  }
  return value;
}

function requireIsoDate(value: unknown, field: string) {
  const text = requireString(value, field);
  if (!Number.isFinite(Date.parse(text))) {
    throw new GrobleWebhookError("invalid_payload", `${field} must be an ISO-8601 timestamp`);
  }
  return text;
}

function requireUuid(value: unknown, field: string) {
  const text = requireString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new GrobleWebhookError("invalid_reference", `${field} must be a UUID`);
  }
  return text;
}

function isGrobleEventType(value: unknown): value is GrobleEventType {
  return typeof value === "string" && supportedEventTypes.includes(value as GrobleEventType);
}

export function createGrobleCheckoutUrl(product: CreditProduct, paymentId: string) {
  const sellerReference = requireUuid(paymentId, "paymentId");
  const checkoutUrl = new URL(product.groble.checkoutUrl);
  if (
    checkoutUrl.protocol !== "https:"
    || checkoutUrl.hostname !== "www.groble.im"
    || checkoutUrl.pathname !== `/payment/${product.groble.contentId}`
  ) {
    throw new Error("Invalid Groble checkout configuration");
  }
  checkoutUrl.search = "";
  checkoutUrl.searchParams.set("ref", sellerReference);
  return checkoutUrl.toString();
}

export function parseGrobleWebhook(rawBody: string): ParsedGrobleEvent {
  let unknownPayload: unknown;
  try {
    unknownPayload = JSON.parse(rawBody);
  } catch {
    throw new GrobleWebhookError("invalid_json", "Webhook body is not valid JSON");
  }

  const envelope = requireRecord(unknownPayload, "payload");
  const eventId = requireString(envelope.id, "id");
  const eventType = envelope.type;
  if (!isGrobleEventType(eventType)) {
    throw new GrobleWebhookError("unsupported_event", "Webhook event type is not supported");
  }
  const version = requireString(envelope.version, "version");
  if (version !== grobleWebhookSchemaVersion) {
    throw new GrobleWebhookError("unsupported_version", "Webhook schema version is not supported");
  }
  const occurredAt = requireIsoDate(envelope.occurredAt, "occurredAt");
  const data = requireRecord(envelope.data, "data");
  const object = requireRecord(data.object, "data.object");
  const merchantUid = requireString(object.merchantUid, "merchantUid");
  const content = requireRecord(object.content, "content");
  const contentId = requireString(content.id, "content.id");
  const contentTitle = requireString(content.title, "content.title");
  const paymentType = requireString(content.paymentType, "content.paymentType");
  const inputMode = requireString(content.inputMode, "content.inputMode");
  const options = object.options;
  if (!Array.isArray(options) || options.length !== 1) {
    throw new GrobleWebhookError("invalid_payload", "options must contain exactly one item");
  }
  const option = requireRecord(options[0], "options[0]");
  const optionId = requireString(option.optionId, "options[0].optionId");
  const optionName = requireString(option.name, "options[0].name");
  const quantity = requirePositiveInteger(option.quantity, "options[0].quantity");
  const subtotal = requirePositiveInteger(option.subtotal, "options[0].subtotal");
  const pricing = requireRecord(object.pricing, "pricing");
  const currency = requireString(pricing.currency, "pricing.currency");
  const amount = requirePositiveInteger(pricing.finalAmount, "pricing.finalAmount");
  const isTestEvent = eventId.startsWith("evt_test_");

  if (!isTestEvent && (paymentType !== "ONE_TIME" || inputMode !== "PAYMENT_WINDOW")) {
    throw new GrobleWebhookError("invalid_product", "Only one-time payment-window products are supported");
  }
  if (currency !== "KRW" || quantity !== 1 || subtotal !== amount) {
    throw new GrobleWebhookError("invalid_amount", "Webhook price snapshot does not match the supported checkout shape");
  }

  const product = getCreditProductByGroble(contentId, optionId);
  if (!isTestEvent && (!product || product.amount !== amount)) {
    throw new GrobleWebhookError("unknown_product", "Webhook product is not registered");
  }

  let sellerReference: string | null = null;
  let paymentId: string | null = null;
  if (eventType === "payment.completed") {
    if (isTestEvent) {
      sellerReference = typeof object.sellerReference === "string" ? object.sellerReference : null;
    } else {
      sellerReference = requireUuid(object.sellerReference, "sellerReference");
      paymentId = sellerReference;
    }
  }

  let refundAmount: number | null = null;
  let partialRefund: boolean | null = null;
  let actionAt: string | null = null;
  let eventAction: Record<string, unknown> | null = null;

  if (eventType === "payment.cancel_requested") {
    const cancelRequest = requireRecord(object.cancelRequest, "cancelRequest");
    actionAt = requireIsoDate(cancelRequest.requestedAt, "cancelRequest.requestedAt");
    eventAction = { requestedBy: cancelRequest.requestedBy, requestedAt: actionAt };
  }

  if (eventType === "payment.refunded") {
    const refund = requireRecord(object.refund, "refund");
    refundAmount = requirePositiveInteger(refund.amount, "refund.amount");
    if (refund.currency !== "KRW" || typeof refund.partialRefund !== "boolean") {
      throw new GrobleWebhookError("invalid_refund", "Refund currency or type is invalid");
    }
    partialRefund = refund.partialRefund;
    actionAt = requireIsoDate(refund.refundedAt, "refund.refundedAt");
    eventAction = {
      amount: refundAmount,
      currency: "KRW",
      partialRefund,
      cancelledBy: refund.cancelledBy,
      refundedAt: actionAt,
    };
  }

  return {
    eventId,
    eventType,
    version,
    occurredAt,
    paymentId,
    merchantUid,
    sellerReference,
    productId: product?.id ?? null,
    contentId,
    optionId,
    amount,
    refundAmount,
    partialRefund,
    actionAt,
    sanitizedPayload: {
      id: eventId,
      type: eventType,
      version,
      occurredAt,
      merchantUid,
      sellerReference,
      content: { id: contentId, title: contentTitle, paymentType, inputMode },
      option: { optionId, name: optionName, quantity, subtotal },
      pricing: { currency, finalAmount: amount },
      action: eventAction,
    },
  };
}

// Groble retries 500 seven times over roughly 44 hours and treats 400 as a final failure, so 500 is
// reserved for codes a deploy can still fix: the same payload would settle once we register the
// product, accept the schema version, or correct the price. Codes whose outcome cannot change on
// redelivery — a buyer-stripped ?ref, a subscription event we never handle — stay 400 and rely on
// the quarantine row instead, so they cannot push the endpoint toward Groble's auto-disable.
const retryableWebhookErrorCodes = new Set([
  "unsupported_version",
  "unknown_product",
  "invalid_product",
  "invalid_amount",
  "invalid_refund",
]);

export function isRetryableGrobleWebhookError(code: string) {
  return retryableWebhookErrorCodes.has(code);
}

const maxShapeDepth = 4;
const maxShapeKeys = 40;

// Structure only: keys and value types, never the values themselves, so a quarantined payload can
// be diagnosed without copying buyer details into our database.
function describeShape(value: unknown, depth: number): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (depth >= maxShapeDepth) return "array";
    return { array: value.length, item: value.length > 0 ? describeShape(value[0], depth + 1) : "empty" };
  }
  if (isRecord(value)) {
    if (depth >= maxShapeDepth) return "object";
    const keys = Object.keys(value).sort().slice(0, maxShapeKeys);
    return Object.fromEntries(keys.map((key) => [key, describeShape(value[key], depth + 1)]));
  }
  return typeof value;
}

function optionalString(value: unknown, maxLength = 128) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

export type GrobleRejectionDescription = {
  eventId: string | null;
  eventType: string | null;
  schemaVersion: string | null;
  occurredAt: string | null;
  payloadShape: Record<string, unknown>;
};

export function describeRejectedGroblePayload(rawBody: string): GrobleRejectionDescription {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { eventId: null, eventType: null, schemaVersion: null, occurredAt: null, payloadShape: { parse: "invalid_json" } };
  }
  const envelope = isRecord(payload) ? payload : {};
  const occurredAt = optionalString(envelope.occurredAt, 64);
  return {
    eventId: optionalString(envelope.id, 256),
    eventType: optionalString(envelope.type, 64),
    schemaVersion: optionalString(envelope.version, 64),
    occurredAt: occurredAt && Number.isFinite(Date.parse(occurredAt)) ? occurredAt : null,
    payloadShape: describeShape(payload, 0) as Record<string, unknown>,
  };
}

function parseHex(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function constantTimeEqualHex(left: string, right: string) {
  const leftBytes = parseHex(left);
  const rightBytes = parseHex(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function signGroblePayload(secret: string, timestamp: string, rawBody: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyGrobleWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signaturePrevious: string | null;
  secret: string;
  previousSecret?: string;
  now?: number;
}) {
  const timestampSeconds = input.timestamp && /^\d{10}$/.test(input.timestamp)
    ? Number.parseInt(input.timestamp, 10)
    : Number.NaN;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > grobleWebhookTimestampToleranceSeconds) {
    throw new GrobleWebhookError("invalid_timestamp", "Webhook timestamp is outside the accepted window");
  }
  if (!input.signature) {
    throw new GrobleWebhookError("missing_signature", "Webhook signature is missing");
  }

  const currentExpected = await signGroblePayload(input.secret, input.timestamp!, input.rawBody);
  if (constantTimeEqualHex(currentExpected, input.signature)) return;

  if (input.previousSecret && input.signaturePrevious) {
    const previousExpected = await signGroblePayload(input.previousSecret, input.timestamp!, input.rawBody);
    if (constantTimeEqualHex(previousExpected, input.signaturePrevious)) return;
  }

  throw new GrobleWebhookError("invalid_signature", "Webhook signature does not match");
}
