export type BillingReturnTo = "/edit" | `/edit?resume=${string}`;

export function getSafeBillingReturnTo(value: string | null | undefined): BillingReturnTo | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const url = new URL(value, "https://kakaotalk-theme-maker.invalid");
  if (url.pathname !== "/edit") return undefined;
  if (url.search === "") return "/edit";
  if (url.searchParams.size !== 1) return undefined;
  const token = url.searchParams.get("resume");
  return token && /^[0-9a-f-]{36}$/i.test(token) ? `/edit?resume=${token}` : undefined;
}
