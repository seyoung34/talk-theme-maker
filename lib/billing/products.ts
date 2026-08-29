export const singleCreditPrice = 3000;

export const creditProducts = [
  {
    id: "credit-1",
    credits: 1,
    amount: singleCreditPrice,
    name: "1 Credit",
    label: "크레딧 1개",
    groble: { checkoutUrl: "https://www.groble.im/payment/qZKWSP", contentId: "qZKWSP" },
  },
  {
    id: "credit-2",
    credits: 2,
    amount: 5000,
    name: "2 Credits",
    label: "크레딧 2개",
    badge: { label: "추천 구성", tone: "primary" },
    groble: { checkoutUrl: "https://www.groble.im/payment/ptjv39", contentId: "ptjv39" },
  },
  {
    id: "credit-5",
    credits: 5,
    amount: 11000,
    name: "5 Credits",
    label: "크레딧 5개",
    badge: { label: "최대 할인", tone: "highlight" },
    groble: { checkoutUrl: "https://www.groble.im/payment/mBkPrA", contentId: "mBkPrA" },
  },
] as const;

export type CreditProduct = (typeof creditProducts)[number];
export type CreditProductId = CreditProduct["id"];

/**
 * 결제 상품을 교체해도 이미 열려 있던 결제창의 웹훅은 예전 식별자를 보낼 수 있다.
 * 신규 checkout은 위의 현재 content ID만 사용하고, 이 목록은 진행 중인 결제 정산을 위한
 * 수신 호환 alias로만 유지한다. Groble의 optionId는 결제창 내부의 불투명한 값이므로
 * 상품 판정 키로 복제하지 않는다.
 */
const legacyGrobleProductAliases = [
  { contentId: "VkMcLk", productId: "credit-1" },
  { contentId: "u9xtdR", productId: "credit-2" },
  { contentId: "GVvuC9", productId: "credit-5" },
] as const;

export function getCreditProduct(productId: string | undefined) {
  return creditProducts.find((product) => product.id === productId) ?? null;
}

/**
 * Resolve a credit pack from Groble's content ID.
 *
 * Each credit pack uses its own one-option payment window. The webhook option ID is still
 * recorded for auditing, but it is intentionally not part of entitlement matching because
 * Groble exposes it as an opaque provider value that is not available in the product UI.
 * The webhook amount is checked separately by the parser and database RPC.
 */
export function getCreditProductByGroble(contentId: string) {
  const current = creditProducts.find((product) => product.groble.contentId === contentId);
  if (current) return current;

  const legacy = legacyGrobleProductAliases.find((alias) => alias.contentId === contentId);
  return legacy ? getCreditProduct(legacy.productId) : null;
}
