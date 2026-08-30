import type { CreditLedgerEntryDto, CreditLedgerType } from "@/lib/billing/apiTypes";

/**
 * 크레딧 내역을 사람이 읽는 형태로.
 *
 * **`reason`을 라벨의 근거로 쓰지 않는다.** 그 컬럼에는 캠페인 키(`signup_bonus_*`)나 결제
 * 사유처럼 호출부가 정하는 값이 들어와서 목록으로 고정할 수 없다. `type`과 금액 부호는
 * DB 제약이 지키는 값이라 화면이 기댈 수 있다.
 *
 * `export` 하나가 차감과 환불 양쪽에 쓰인다 — 내보내기를 예약할 때 빼고, 실패하거나 예약이
 * 만료되면 같은 type으로 되돌린다. 그래서 부호를 함께 봐야 무슨 일이 있었는지 말할 수 있다.
 */

export const creditLedgerPageSize = 5;

/**
 * 서버가 한 번에 내려주는 최대 건수.
 *
 * 페이지당 5건이므로 4쪽까지 넘겨 볼 수 있다. 계정 화면의 이 자리는 "최근에 무슨 일이
 * 있었나"를 보는 요약이지 회계 장부가 아니라서, 전체 내역이 필요해지면 별도 화면과 서버
 * 페이지네이션으로 옮기는 편이 맞다. 여기서 한없이 늘리면 `/api/me` 응답만 무거워진다.
 */
export const creditLedgerFetchLimit = 20;

export type CreditLedgerTone = "credit" | "debit";

export type CreditLedgerDescription = {
  readonly label: string;
  readonly tone: CreditLedgerTone;
};

export function describeCreditLedgerEntry(entry: Pick<CreditLedgerEntryDto, "type" | "amount">): CreditLedgerDescription {
  const tone: CreditLedgerTone = entry.amount < 0 ? "debit" : "credit";
  return { label: getCreditLedgerLabel(entry.type, entry.amount), tone };
}

function getCreditLedgerLabel(type: CreditLedgerType, amount: number): string {
  if (type === "purchase") return "크레딧 충전";
  if (type === "promotion") return "혜택 지급";
  if (type === "refund") return "결제 환불";
  // `export`는 예약 차감과 되돌림을 함께 쓴다.
  return amount < 0 ? "테마 파일 내보내기" : "내보내기 취소 환불";
}

/** `+3` / `-1`. 0은 나오지 않지만 들어와도 부호 없이 그린다. */
export function formatCreditLedgerAmount(amount: number): string {
  if (amount > 0) return `+${amount}`;
  return String(amount);
}
