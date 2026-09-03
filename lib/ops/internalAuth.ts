export type OpsInternalAuthResult =
  | { ok: true }
  | { ok: false; reason: "configuration_missing" | "unauthorized" };

export function authorizeOpsInternalRequest(request: Request, env: Record<string, string | undefined> = process.env): OpsInternalAuthResult {
  const configuredToken = env.OPS_NOTIFICATIONS_DRAIN_TOKEN?.trim();
  if (!configuredToken) return { ok: false, reason: "configuration_missing" };

  const requestToken = request.headers.get("x-ops-notifications-token") ?? "";
  return constantTimeEqual(requestToken, configuredToken)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
