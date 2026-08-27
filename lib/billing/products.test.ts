import { describe, expect, it } from "vitest";
import { creditProducts, getCreditProduct, getCreditProductByGroble, singleCreditPrice } from "@/lib/billing/products";

describe("creditProducts", () => {
  it("defines the approved 1, 2, and 5 credit packages", () => {
    expect(creditProducts).toEqual([
      { id: "credit-1", credits: 1, amount: 3000, name: "1 Credit", label: "1크레딧", groble: { checkoutUrl: "https://www.groble.im/payment/VkMcLk", contentId: "VkMcLk", optionId: "9361" } },
      { id: "credit-2", credits: 2, amount: 5000, name: "2 Credits", label: "2크레딧", badge: "가장 많이 선택", groble: { checkoutUrl: "https://www.groble.im/payment/u9xtdR", contentId: "u9xtdR", optionId: "9362" } },
      { id: "credit-5", credits: 5, amount: 11000, name: "5 Credits", label: "5크레딧", badge: "가장 높은 할인", groble: { checkoutUrl: "https://www.groble.im/payment/GVvuC9", contentId: "GVvuC9", optionId: "9367" } },
    ]);
    expect(singleCreditPrice).toBe(3000);
  });

  it("accepts current product IDs and rejects retired packages", () => {
    expect(getCreditProduct("credit-2"))?.toMatchObject({ credits: 2, amount: 5000 });
    expect(getCreditProduct("credit-5"))?.toMatchObject({ credits: 5, amount: 11000 });
    expect(getCreditProduct("credit-4")).toBeNull();
    expect(getCreditProduct("credit-10")).toBeNull();
  });

  it("maps Groble content and option IDs to exactly one product", () => {
    expect(getCreditProductByGroble("u9xtdR", "9362"))?.toMatchObject({ id: "credit-2", amount: 5000 });
    expect(getCreditProductByGroble("u9xtdR", "wrong")).toBeNull();
  });
});
