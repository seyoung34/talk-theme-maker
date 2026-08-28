export const singleCreditPrice = 3000;

export const creditProducts = [
  {
    id: "credit-1",
    credits: 1,
    amount: singleCreditPrice,
    name: "1 Credit",
    label: "1크레딧",
    groble: { checkoutUrl: "https://www.groble.im/payment/qZKWSP", contentId: "qZKWSP", optionId: "9373" },
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

/**
 * 결제 상품을 교체해도 이미 열려 있던 결제창의 웹훅은 예전 식별자를 보낼 수 있다.
 * 신규 checkout은 위의 현재 식별자만 사용하고, 이 목록은 진행 중인 결제 정산을 위한
 * 수신 호환 alias로만 유지한다.
 */
const legacyGrobleProductAliases = [
  { contentId: "VkMcLk", optionId: "9361", productId: "credit-1" },
] as const;

export function getCreditProduct(productId: string | undefined) {
  return creditProducts.find((product) => product.id === productId) ?? null;
}

export function getCreditProductByGroble(contentId: string, optionId: string) {
  const current = creditProducts.find(
    (product) => product.groble.contentId === contentId && product.groble.optionId === optionId,
  );
  if (current) return current;

  const legacy = legacyGrobleProductAliases.find(
    (alias) => alias.contentId === contentId && alias.optionId === optionId,
  );
  return legacy ? getCreditProduct(legacy.productId) : null;
}
