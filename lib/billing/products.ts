export const creditProducts = [
  { id: "credit-1", credits: 1, amount: 3000, name: "1 Credit", label: "1크레딧" },
  { id: "credit-4", credits: 4, amount: 9900, name: "4 Credits", label: "4크레딧", badge: "가장 많이 선택" },
  { id: "credit-10", credits: 10, amount: 22900, name: "10 Credits", label: "10크레딧", badge: "가장 높은 할인" },
] as const;

export type CreditProduct = (typeof creditProducts)[number];
export type CreditProductId = CreditProduct["id"];

export function getCreditProduct(productId: string | undefined) {
  return creditProducts.find((product) => product.id === productId) ?? null;
}
