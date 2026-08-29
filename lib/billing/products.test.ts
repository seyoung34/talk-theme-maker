import { describe, expect, it } from "vitest";
import { creditProducts, getCreditProduct, getCreditProductByGroble, singleCreditPrice } from "@/lib/billing/products";

describe("creditProducts", () => {
  it("defines the approved 1, 2, and 5 credit packages", () => {
    expect(creditProducts).toEqual([
      { id: "credit-1", credits: 1, amount: 3000, name: "1 Credit", label: "크레딧 1개", groble: { checkoutUrl: "https://www.groble.im/payment/qZKWSP", contentId: "qZKWSP" } },
      { id: "credit-2", credits: 2, amount: 5000, name: "2 Credits", label: "크레딧 2개", badge: { label: "추천 구성", tone: "primary" }, groble: { checkoutUrl: "https://www.groble.im/payment/ptjv39", contentId: "ptjv39" } },
      { id: "credit-5", credits: 5, amount: 11000, name: "5 Credits", label: "크레딧 5개", badge: { label: "최대 할인", tone: "highlight" }, groble: { checkoutUrl: "https://www.groble.im/payment/mBkPrA", contentId: "mBkPrA" } },
    ]);
    expect(singleCreditPrice).toBe(3000);
  });

  it("accepts current product IDs and rejects retired packages", () => {
    expect(getCreditProduct("credit-2"))?.toMatchObject({ credits: 2, amount: 5000 });
    expect(getCreditProduct("credit-5"))?.toMatchObject({ credits: 5, amount: 11000 });
    expect(getCreditProduct("credit-4")).toBeNull();
    expect(getCreditProduct("credit-10")).toBeNull();
  });

  it("maps Groble content IDs without requiring opaque option IDs", () => {
    expect(getCreditProductByGroble("qZKWSP"))?.toMatchObject({ id: "credit-1", amount: 3000 });
    expect(getCreditProductByGroble("VkMcLk"))?.toMatchObject({ id: "credit-1", amount: 3000 });
    expect(getCreditProductByGroble("ptjv39"))?.toMatchObject({ id: "credit-2", amount: 5000 });
    expect(getCreditProductByGroble("u9xtdR"))?.toMatchObject({ id: "credit-2", amount: 5000 });
    expect(getCreditProductByGroble("mBkPrA"))?.toMatchObject({ id: "credit-5", amount: 11000 });
    expect(getCreditProductByGroble("GVvuC9"))?.toMatchObject({ id: "credit-5", amount: 11000 });
    expect(getCreditProductByGroble("unknown-content")).toBeNull();
  });
});
