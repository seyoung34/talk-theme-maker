import { describe, expect, it } from "vitest";
import { authorizeOpsInternalRequest } from "@/lib/ops/internalAuth";

describe("ops internal request authorization", () => {
  it("requires the configured token", () => {
    const request = new Request("https://talktheme.test/api/internal/ops");

    expect(authorizeOpsInternalRequest(request, {})).toEqual({
      ok: false,
      reason: "configuration_missing",
    });
    expect(authorizeOpsInternalRequest(request, { OPS_NOTIFICATIONS_DRAIN_TOKEN: "drain-token" })).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("accepts the exact token and rejects a prefix match", () => {
    const environment = { OPS_NOTIFICATIONS_DRAIN_TOKEN: "drain-token" };

    expect(authorizeOpsInternalRequest(
      new Request("https://talktheme.test/api/internal/ops", { headers: { "x-ops-notifications-token": "drain-token" } }),
      environment,
    )).toEqual({ ok: true });
    expect(authorizeOpsInternalRequest(
      new Request("https://talktheme.test/api/internal/ops", { headers: { "x-ops-notifications-token": "drain-token-extra" } }),
      environment,
    )).toEqual({ ok: false, reason: "unauthorized" });
  });
});
