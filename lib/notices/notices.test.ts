import { describe, expect, it } from "vitest";
import { isNoticeCategory, mapNoticeRow, toNoticeParagraphs } from "@/lib/notices/types";
import { toNoticeRow, validateNoticeBody } from "@/lib/notices/adminApi";

/**
 * 본문은 마크다운이 아니다.
 *
 * 렌더러를 붙이지 않기로 했으므로(의존성 + 관리자 입력 HTML의 XSS 경로), 빈 줄로 문단을
 * 나누는 것이 표현의 전부다. 이 규칙이 흔들리면 이미 발행된 공지의 줄바꿈이 통째로 달라진다.
 */
describe("toNoticeParagraphs", () => {
  it("빈 줄로 문단을 나눈다", () => {
    expect(toNoticeParagraphs("첫 문단\n\n둘째 문단")).toEqual(["첫 문단", "둘째 문단"]);
  });

  it("문단 안의 한 줄 바꿈은 유지한다", () => {
    // 렌더 쪽에서 `whitespace-pre-line`으로 그리므로 여기서 지우면 안 된다.
    expect(toNoticeParagraphs("한 줄\n다음 줄")).toEqual(["한 줄\n다음 줄"]);
  });

  it("빈 줄이 여러 개거나 공백이 섞여도 하나로 본다", () => {
    expect(toNoticeParagraphs("앞\n\n  \n\n뒤")).toEqual(["앞", "뒤"]);
  });

  it("내용이 없으면 빈 배열이다", () => {
    expect(toNoticeParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("isNoticeCategory", () => {
  it("정해진 값만 통과한다", () => {
    expect(isNoticeCategory("update")).toBe(true);
    expect(isNoticeCategory("notice")).toBe(false);
    expect(isNoticeCategory(undefined)).toBe(false);
  });
});

describe("mapNoticeRow", () => {
  const row = {
    id: "id-1",
    title: "제목",
    body: "본문",
    category: "update",
    pinned: true,
    published_at: "2026-08-05T00:00:00.000Z",
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
  };

  it("DB 행을 도메인 값으로 옮긴다", () => {
    expect(mapNoticeRow(row)).toMatchObject({ id: "id-1", category: "update", pinned: true, publishedAt: "2026-08-05T00:00:00.000Z" });
  });

  it("모르는 분류는 기타로 떨어뜨린다", () => {
    // CHECK 제약이 막지만, 제약을 늘린 뒤 배포 순서가 어긋나면 옛 코드가 새 값을 읽는다.
    expect(mapNoticeRow({ ...row, category: "unknown" }).category).toBe("etc");
  });
});

/**
 * 검증은 마이그레이션의 CHECK 제약과 같은 값을 쓴다. 한쪽만 있으면 DB 오류가 500으로 새거나
 * 사용자가 거절 이유를 알 수 없다.
 */
describe("validateNoticeBody", () => {
  const valid = { title: "제목", body: "본문", category: "update", pinned: false, publishedAt: null };

  it("올바른 입력은 통과한다", () => {
    expect(validateNoticeBody(valid)).toBeNull();
  });

  it("공백만 있는 제목·본문은 막는다", () => {
    expect(validateNoticeBody({ ...valid, title: "   " })).toBe("제목을 입력해 주세요.");
    expect(validateNoticeBody({ ...valid, body: "\n\n" })).toBe("내용을 입력해 주세요.");
  });

  it("길이 상한은 DB 제약과 같다", () => {
    expect(validateNoticeBody({ ...valid, title: "가".repeat(201) })).toBe("제목은 200자 이하로 입력해 주세요.");
    expect(validateNoticeBody({ ...valid, body: "가".repeat(20001) })).toBe("내용은 20000자 이하로 입력해 주세요.");
  });

  it("분류가 목록에 없으면 막는다", () => {
    expect(validateNoticeBody({ ...valid, category: "hello" })).toBe("분류를 선택해 주세요.");
  });

  it("발행 시각을 비우면 초안으로 통과시킨다", () => {
    expect(validateNoticeBody({ ...valid, publishedAt: "" })).toBeNull();
    expect(toNoticeRow({ ...valid, publishedAt: "" }).published_at).toBeNull();
  });

  it("날짜로 읽히지 않는 발행 시각은 막는다", () => {
    expect(validateNoticeBody({ ...valid, publishedAt: "곧" })).toBe("발행 시각이 올바르지 않습니다.");
  });
});

describe("toNoticeRow", () => {
  it("제목과 본문의 앞뒤 공백을 정리한다", () => {
    const row = toNoticeRow({ title: "  제목  ", body: "  본문  ", category: "policy", pinned: true, publishedAt: "2026-08-05T00:00:00.000Z" });
    expect(row).toEqual({ title: "제목", body: "본문", category: "policy", pinned: true, published_at: "2026-08-05T00:00:00.000Z" });
  });
});
