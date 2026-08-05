import { describe, expect, it } from "vitest";
import {
  canReplyToInquiry,
  hasUnreadAnswer,
  inquiryLimits,
  isInquiryCategory,
  isInquiryStatus,
  mapInquiryRow,
} from "@/lib/inquiries/types";
import { validateInquiryCreate, validateInquiryMessage, validateInquiryStatus } from "@/lib/inquiries/api";

const validCreate = { category: "payment", title: "결제 문의", body: "본문입니다" };

/**
 * 검증 값은 마이그레이션의 CHECK 제약과 같아야 한다. 한쪽만 있으면 DB 오류가 500으로 새거나
 * 사용자가 거절 사유를 알 수 없다.
 */
describe("validateInquiryCreate", () => {
  it("올바른 입력은 통과한다", () => {
    expect(validateInquiryCreate(validCreate)).toBeNull();
  });

  it("분류가 목록에 없으면 막는다", () => {
    expect(validateInquiryCreate({ ...validCreate, category: "refund" })).toBe("문의 분류를 선택해 주세요.");
    expect(validateInquiryCreate({ ...validCreate, category: undefined })).toBe("문의 분류를 선택해 주세요.");
  });

  it("공백만 있는 제목·본문은 막는다", () => {
    expect(validateInquiryCreate({ ...validCreate, title: "   " })).toBe("제목을 입력해 주세요.");
    expect(validateInquiryCreate({ ...validCreate, body: "\n\n" })).toBe("내용을 입력해 주세요.");
  });

  it("길이 상한은 DB 제약과 같다", () => {
    expect(validateInquiryCreate({ ...validCreate, title: "가".repeat(inquiryLimits.titleMax + 1) })).toContain("제목은");
    expect(validateInquiryCreate({ ...validCreate, body: "가".repeat(inquiryLimits.bodyMax + 1) })).toContain("내용은");
    expect(validateInquiryCreate({ ...validCreate, title: "가".repeat(inquiryLimits.titleMax) })).toBeNull();
  });

  it("내보내기 작업 번호가 UUID가 아니면 막는다", () => {
    // 형식만 본다. 본인 소유인지는 서버가 DB에 물어봐야 알 수 있다(assertOwnedExportJob).
    expect(validateInquiryCreate({ ...validCreate, exportJobId: "1234" })).toContain("형식이 올바르지 않습니다");
    expect(validateInquiryCreate({ ...validCreate, exportJobId: "6f1b3c2e-8a4d-4c1f-9b2e-0d5a7c3e1f42" })).toBeNull();
    expect(validateInquiryCreate({ ...validCreate, exportJobId: null })).toBeNull();
  });
});

describe("validateInquiryMessage", () => {
  it("빈 본문을 막고 상한을 지킨다", () => {
    expect(validateInquiryMessage({ body: " " })).toBe("내용을 입력해 주세요.");
    expect(validateInquiryMessage({ body: "가".repeat(inquiryLimits.bodyMax + 1) })).toContain("내용은");
    expect(validateInquiryMessage({ body: "정상" })).toBeNull();
  });
});

describe("validateInquiryStatus", () => {
  it("정해진 상태만 통과한다", () => {
    expect(validateInquiryStatus("closed")).toBeNull();
    expect(validateInquiryStatus("done")).toBe("문의 상태 값이 올바르지 않습니다.");
  });
});

describe("isInquiryCategory / isInquiryStatus", () => {
  it("목록에 있는 값만 통과한다", () => {
    expect(isInquiryCategory("privacy")).toBe(true);
    expect(isInquiryCategory("hello")).toBe(false);
    expect(isInquiryStatus("answered")).toBe(true);
    expect(isInquiryStatus(undefined)).toBe(false);
  });
});

/**
 * 종료된 문의에는 글이 붙지 않는다. 붙으면 관리자 목록에서 사라진 채 대화가 이어진다.
 * DB의 INSERT 정책이 실제 경계이고, 이 함수는 화면이 미리 막기 위한 같은 규칙이다.
 */
describe("canReplyToInquiry", () => {
  it("종료된 문의만 답신을 막는다", () => {
    expect(canReplyToInquiry("open")).toBe(true);
    expect(canReplyToInquiry("answered")).toBe(true);
    expect(canReplyToInquiry("closed")).toBe(false);
  });
});

/**
 * 답변 알림을 보내지 않기로 했으므로 사용자는 직접 들어와 확인한다.
 * `answered_at`은 **마지막** 관리자 답변 시각이라, 그 뒤에 읽었는지로 판정한다.
 */
describe("hasUnreadAnswer", () => {
  it("답변이 없으면 미확인이 아니다", () => {
    expect(hasUnreadAnswer({ answeredAt: null, userReadAt: null })).toBe(false);
  });

  it("답변이 있고 한 번도 안 읽었으면 미확인이다", () => {
    expect(hasUnreadAnswer({ answeredAt: "2026-08-05T00:00:00.000Z", userReadAt: null })).toBe(true);
  });

  it("읽은 뒤에 새 답변이 달리면 다시 미확인이다", () => {
    expect(hasUnreadAnswer({ answeredAt: "2026-08-05T02:00:00.000Z", userReadAt: "2026-08-05T01:00:00.000Z" })).toBe(true);
  });

  it("답변보다 나중에 읽었으면 확인한 것이다", () => {
    expect(hasUnreadAnswer({ answeredAt: "2026-08-05T01:00:00.000Z", userReadAt: "2026-08-05T02:00:00.000Z" })).toBe(false);
  });
});

describe("mapInquiryRow", () => {
  const row = {
    id: "id-1",
    category: "export",
    title: "제목",
    status: "answered",
    export_job_id: null,
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    answered_at: "2026-08-05T00:00:00.000Z",
    user_read_at: null,
  };

  it("DB 행을 도메인 값으로 옮긴다", () => {
    expect(mapInquiryRow(row)).toMatchObject({ id: "id-1", category: "export", status: "answered", exportJobId: null });
  });

  it("모르는 분류·상태는 안전한 기본값으로 떨어뜨린다", () => {
    // CHECK 제약이 막지만, 제약을 늘린 뒤 배포 순서가 어긋나면 옛 코드가 새 값을 읽는다.
    const mapped = mapInquiryRow({ ...row, category: "unknown", status: "unknown" });
    expect(mapped.category).toBe("etc");
    expect(mapped.status).toBe("open");
  });
});
