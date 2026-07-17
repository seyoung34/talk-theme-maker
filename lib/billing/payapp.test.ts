import { describe, expect, it } from "vitest";
import { sanitizePayappError, sanitizePayappPayload } from "@/lib/billing/payapp";

describe("sanitizePayappPayload", () => {
  it("keeps operational fields without persisting credentials or contact details", () => {
    const result = sanitizePayappPayload({
      pay_state: "4",
      price: "3000",
      mul_no: "provider-payment-id",
      recvphone: "01012345678",
      userid: "merchant-user",
      linkkey: "secret-key",
      linkval: "secret-value",
      var1: "internal-payment-id",
      var2: "internal-order-id",
    });

    expect(result).toMatchObject({ pay_state: "4", price: "3000", mul_no: "provider-payment-id" });
    expect(result).not.toHaveProperty("recvphone");
    expect(result).not.toHaveProperty("userid");
    expect(result).not.toHaveProperty("linkkey");
    expect(result).not.toHaveProperty("linkval");
    expect(result).not.toHaveProperty("var1");
    expect(result).not.toHaveProperty("var2");
  });

  it("redacts phone numbers and email addresses in provider messages", () => {
    const result = sanitizePayappPayload({
      errorMessage: "010-1234-5678 또는 person@example.com으로 문의",
    });

    expect(result.errorMessage).toBe("[PHONE_REDACTED] 또는 [EMAIL_REDACTED]으로 문의");
  });

  it("sanitizes locally generated error messages", () => {
    expect(sanitizePayappError(new Error("01012345678 request failed"))).toEqual({ error: "[PHONE_REDACTED] request failed" });
  });
});
