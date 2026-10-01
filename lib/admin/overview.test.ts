import { describe, expect, it } from "vitest";
import type { OpsDailySummaryCounts, OpsStatusSnapshot } from "@/lib/ops/repository";
import { buildAdminOverview, type AdminOverviewInput } from "./overview";

const snapshot: OpsStatusSnapshot = {
  pendingExports: 2,
  staleExports: 1,
  pendingNotifications: 0,
  retryNotifications: 0,
  deadLetterNotifications: 0,
  openInquiries: 9,
  billingHolds: 0,
  lastP1At: null,
};

const today: OpsDailySummaryCounts = {
  signups: 4,
  paymentsPaid: 2,
  paymentsPaidAmount: 8000,
  paymentFailures: 1,
  refundsCount: 0,
  refundsAmount: 0,
  refundsReviewRequired: 0,
  exportsSucceeded: 12,
  exportsFailed: 3,
  exportsPending: 1,
  newInquiries: 1,
  openInquiries: 9,
  p1Issues: 1,
  p2Issues: 2,
  deadLetterNotifications: 0,
};

const loaded: AdminOverviewInput = {
  snapshot: { ok: true, value: snapshot },
  openInquiries: { ok: true, value: 3 },
  refundReviews: { ok: true, value: 0 },
  today: { ok: true, value: today },
  issues: { ok: true, value: [{ eventId: "e1", eventType: "export.failed", severity: "P2", occurredAt: "2026-10-02T01:00:00Z" }] },
};

describe("buildAdminOverview", () => {
  it("문의 대기는 RPC의 open+answered가 아니라 open 건수를 쓴다", () => {
    const card = buildAdminOverview(loaded).attention.find((item) => item.id === "open-inquiries");
    expect(card?.value).toBe("3");
    expect(card?.href).toBe("/admin/inquiries");
  });

  it("처리 필요 카드는 0보다 클 때만 강조한다", () => {
    const attention = buildAdminOverview(loaded).attention;
    expect(attention.find((item) => item.id === "stale-exports")?.emphasized).toBe(true);
    expect(attention.find((item) => item.id === "refund-reviews")?.emphasized).toBe(false);
    expect(attention.find((item) => item.id === "billing-holds")?.emphasized).toBe(false);
  });

  it("조회가 실패한 카드는 0이 아니라 확인 불가로 남고 다른 카드는 유지된다", () => {
    const overview = buildAdminOverview({ ...loaded, snapshot: { ok: false }, today: { ok: false } });
    const stale = overview.attention.find((item) => item.id === "stale-exports");
    expect(stale?.value).toBeUndefined();
    expect(stale?.unavailable).toBe(true);
    expect(stale?.emphasized).toBe(false);
    expect(overview.attention.find((item) => item.id === "open-inquiries")?.value).toBe("3");
    expect(overview.today.every((item) => item.unavailable)).toBe(true);
  });

  it("오늘 카드는 금액과 보조 수치를 함께 보여준다", () => {
    const cards = buildAdminOverview(loaded).today;
    expect(cards.find((item) => item.id === "payments")?.hint).toBe("8,000원 · 실패 1");
    expect(cards.find((item) => item.id === "exports")?.hint).toBe("실패 3 · 대기 1");
    expect(cards.find((item) => item.id === "issues")?.value).toBe("3");
  });

  it("이슈는 운영자가 읽는 이름으로 바꾼다", () => {
    const issues = buildAdminOverview(loaded).issues;
    expect(issues.ok && issues.value[0]?.label).toBe("export 실패");
  });
});
