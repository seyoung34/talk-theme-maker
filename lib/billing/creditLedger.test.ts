import { describe, expect, it } from "vitest";
import { creditLedgerPageSize, describeCreditLedgerEntry, formatCreditLedgerAmount } from "@/lib/billing/creditLedger";

describe("describeCreditLedgerEntry", () => {
  it.each([
    ["purchase", 3, "크레딧 충전"],
    ["promotion", 1, "혜택 지급"],
    ["refund", -3, "결제 환불"],
  ] as const)("%s는 %s 크레딧에 '%s'로 읽힌다", (type, amount, label) => {
    expect(describeCreditLedgerEntry({ type, amount }).label).toBe(label);
  });

  /**
   * `export` 하나가 예약 차감과 되돌림 양쪽에 쓰인다. 부호를 보지 않으면 환불받은 줄을
   * "내보내기"로 읽어, 쓰지 않은 크레딧을 쓴 것처럼 보여 준다.
   */
  it("export는 부호로 차감과 환불을 가른다", () => {
    expect(describeCreditLedgerEntry({ type: "export", amount: -1 }).label).toBe("테마 파일 내보내기");
    expect(describeCreditLedgerEntry({ type: "export", amount: 1 }).label).toBe("내보내기 취소 환불");
  });

  it("음수만 차감으로 본다", () => {
    expect(describeCreditLedgerEntry({ type: "export", amount: -1 }).tone).toBe("debit");
    expect(describeCreditLedgerEntry({ type: "purchase", amount: 5 }).tone).toBe("credit");
  });
});

describe("formatCreditLedgerAmount", () => {
  it("지급에는 부호를 붙이고 차감은 그대로 둔다", () => {
    expect(formatCreditLedgerAmount(3)).toBe("+3");
    expect(formatCreditLedgerAmount(-1)).toBe("-1");
  });
});

/** 두 목록이 같은 장 크기를 써야 나란히 놓인 카드 높이가 어긋나지 않는다. */
describe("creditLedgerPageSize", () => {
  it("한 장에 5건을 담는다", () => {
    expect(creditLedgerPageSize).toBe(5);
  });
});
