const defaultReturnTarget = "/account";

export function getSafeReturnTarget(value: string | null | undefined, fallback = defaultReturnTarget) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
