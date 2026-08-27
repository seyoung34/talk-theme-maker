export const singleCreditPrice = 3000;

export const creditProducts = [
  {
    id: "credit-1",
    credits: 1,
    amount: singleCreditPrice,
    name: "1 Credit",
    label: "1크레딧",
    groble: { checkoutUrl: "https://www.groble.im/payment/VkMcLk", contentId: "VkMcLk", optionId: "9361" },
  },
  {
    id: "credit-2",
    credits: 2,
    amount: 5000,
    name: "2 Credits",
    label: "2크레딧",
    badge: "가장 많이 선택",
    groble: { checkoutUrl: "https://www.groble.im/payment/u9xtdR", contentId: "u9xtdR", optionId: "9362" },
  },
  {
    id: "credit-5",
    credits: 5,
    amount: 11000,
    name: "5 Credits",
    label: "5크레딧",
    badge: "가장 높은 할인",
    groble: { checkoutUrl: "https://www.groble.im/payment/GVvuC9", contentId: "GVvuC9", optionId: "9367" },
  },
] as const;

export type CreditProduct = (typeof creditProducts)[number];
export type CreditProductId = CreditProduct["id"];

export function getCreditProduct(productId: string | undefined) {
  return creditProducts.find((product) => product.id === productId) ?? null;
}

export function getCreditProductByGroble(contentId: string, optionId: string) {
  return creditProducts.find(
    (product) => product.groble.contentId === contentId && product.groble.optionId === optionId,
  ) ?? null;
}
