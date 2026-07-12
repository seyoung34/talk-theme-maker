import { describe, expect, it } from "vitest";
import { getSafeBillingReturnTo } from "@/lib/billing/returnTo";

describe("getSafeBillingReturnTo", () => {
  it("allows the editor and a recovery resume URL", () => {
    expect(getSafeBillingReturnTo("/edit")).toBe("/edit");
    expect(getSafeBillingReturnTo("/edit?resume=123e4567-e89b-12d3-a456-426614174000"))
      .toBe("/edit?resume=123e4567-e89b-12d3-a456-426614174000");
  });

  it("rejects foreign paths and unexpected query parameters", () => {
    expect(getSafeBillingReturnTo("https://example.com/edit")).toBeUndefined();
    expect(getSafeBillingReturnTo("/account")).toBeUndefined();
    expect(getSafeBillingReturnTo("/edit?next=/account")).toBeUndefined();
    expect(getSafeBillingReturnTo("/edit?resume=not-a-token")).toBeUndefined();
  });
});
