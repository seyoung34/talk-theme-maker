import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 그로블 웹훅 수신 라우트.
 *
 * 크레딧이 늘어나는 유일한 경로이고, 응답 코드가 그대로 그로블의 재시도 정책을 움직인다. 400은 최종
 * 실패라 결제가 그대로 사라지고, 500은 7회·약 44시간 재전송을 부르며 반복되면 엔드포인트가 자동
 * 비활성화된다. 그래서 "어떤 거절이 어떤 상태 코드로 나가는가"와 "거절이 반드시 흔적을 남기는가"를
 * 고정한다.
 */
describe("POST /api/billing/groble/webhook", () => {
  const secret = "test-secret";
  let processGrobleWebhookEvent: ReturnType<typeof vi.fn>;
  let recordGrobleWebhookRejection: ReturnType<typeof vi.fn>;
  let requireGrobleServerConfig: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  function completedPayload() {
    return {
      id: "evt_live_1",
      type: "payment.completed",
      version: "2026-04-30",
      occurredAt: "2026-08-28T10:00:00+09:00",
      data: {
        object: {
          merchantUid: "merchant-1",
          sellerReference: "90df4ea9-dd9f-4f5a-91cc-b4c09344f96a",
          buyer: { email: "must-not-be-logged@example.com", phoneNumber: "01012345678" },
          content: { id: "u9xtdR", title: "크레딧 2개", paymentType: "ONE_TIME", inputMode: "PAYMENT_WINDOW" },
          options: [{ optionId: "9362", name: "기본 옵션", quantity: 1, subtotal: 5000 }],
          pricing: { currency: "KRW", finalAmount: 5000 },
        },
      },
    };
  }

  async function sign(timestamp: string, rawBody: string, withSecret = secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(withSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function deliver(payload: unknown, overrides: Record<string, string | null> = {}) {
    const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers = new Headers({
      "content-type": "application/json",
      "x-groble-timestamp": timestamp,
      "x-groble-idempotency-key": "idem-1",
      "x-groble-signature": await sign(timestamp, rawBody),
    });
    for (const [name, value] of Object.entries(overrides)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    const { POST } = await import("@/app/api/billing/groble/webhook/route");
    return POST(new Request("https://talktheme.test/api/billing/groble/webhook", { method: "POST", body: rawBody, headers }));
  }

  beforeEach(() => {
    vi.resetModules();
    processGrobleWebhookEvent = vi.fn(async () => ({ result: "processed" }));
    recordGrobleWebhookRejection = vi.fn(async () => undefined);
    requireGrobleServerConfig = vi.fn(() => ({ grobleWebhookSecret: secret, grobleWebhookPreviousSecret: undefined }));
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/lib/billing/paymentRepository", () => ({ processGrobleWebhookEvent, recordGrobleWebhookRejection }));
    vi.doMock("@/lib/supabase/config", () => ({ requireGrobleServerConfig }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/billing/paymentRepository");
    vi.doUnmock("@/lib/supabase/config");
    vi.restoreAllMocks();
  });

  it("서명이 맞으면 처리하고 격리하지 않는다", async () => {
    const response = await deliver(completedPayload());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "processed" });
    expect(processGrobleWebhookEvent).toHaveBeenCalledOnce();
    expect(recordGrobleWebhookRejection).not.toHaveBeenCalled();
  });

  it("서명이 틀리면 401이고 격리 테이블을 건드리지 않는다", async () => {
    const response = await deliver(completedPayload(), { "x-groble-signature": "0".repeat(64) });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ received: false, reason: "invalid_signature" });
    // 인증되지 않은 요청까지 적재하면 누구나 격리 테이블을 채울 수 있다.
    expect(recordGrobleWebhookRejection).not.toHaveBeenCalled();
    expect(processGrobleWebhookEvent).not.toHaveBeenCalled();
  });

  it("서명 실패 로그에 헤더 이름만 남기고 값과 본문은 남기지 않는다", async () => {
    await deliver(completedPayload(), { "x-groble-signature": "0".repeat(64) });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("x-groble-signature");
    expect(logged).toContain("x-groble-idempotency-key");
    expect(logged).not.toContain("must-not-be-logged");
    expect(logged).not.toContain("01012345678");
    expect(logged).not.toContain("merchant-1");
  });

  it("배포로 고칠 수 있는 거절은 500으로 재전송을 요청하며 격리한다", async () => {
    const payload = completedPayload();
    payload.version = "2099-01-01";

    const response = await deliver(payload);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ reason: "unsupported_version" });
    expect(recordGrobleWebhookRejection).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-1", errorCode: "unsupported_version" }),
    );
  });

  it("재전송해도 결과가 같은 거절은 400으로 끝내고 격리만 남긴다", async () => {
    const payload = completedPayload();
    // 구매자가 결제 링크에서 ?ref를 지운 경우다. 다시 보내도 sellerReference는 여전히 없다.
    delete (payload.data.object as { sellerReference?: string }).sellerReference;

    const response = await deliver(payload);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "invalid_reference" });
    expect(recordGrobleWebhookRejection).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invalid_reference" }),
    );
  });

  it("격리 기록이 실패해도 재시도 판단은 뒤집히지 않는다", async () => {
    recordGrobleWebhookRejection.mockRejectedValue(new Error("db down"));
    const payload = completedPayload();
    payload.version = "2099-01-01";

    const response = await deliver(payload);

    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalled();
  });

  it("멱등 키가 없으면 서명을 확인하기 전에 400으로 끝낸다", async () => {
    const response = await deliver(completedPayload(), { "x-groble-idempotency-key": null });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "invalid_idempotency_key" });
    expect(requireGrobleServerConfig).not.toHaveBeenCalled();
  });

  it("서명 시크릿이 없으면 500으로 재전송을 남겨 둔다", async () => {
    requireGrobleServerConfig.mockImplementation(() => {
      throw new Error("Groble server configuration is missing. Set GROBLE_WEBHOOK_SECRET.");
    });

    const response = await deliver(completedPayload());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ reason: "configuration_missing" });
    expect(recordGrobleWebhookRejection).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 요청은 본문을 읽기 전에 거절한다", async () => {
    const response = await deliver(completedPayload(), { "content-type": "text/plain" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "invalid_content_type" });
  });
});
