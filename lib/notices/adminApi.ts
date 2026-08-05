import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/supabase/auth";
import { isNoticeCategory } from "@/lib/notices/types";

export type NoticeWriteBody = {
  title?: string;
  body?: string;
  category?: string;
  pinned?: boolean;
  publishedAt?: string | null;
};

/** 관리자 확인. 통과하면 `null`, 아니면 그대로 돌려줄 응답. */
export async function denyNonAdmin() {
  const adminAuth = await getCurrentAdmin();
  if (!adminAuth.configured || !adminAuth.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!adminAuth.profile) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  return null;
}

/**
 * 공지 입력 검증. 통과하면 `null`, 아니면 사용자에게 보여줄 한국어 사유.
 *
 * 길이 상한은 마이그레이션의 CHECK 제약과 같은 값이다. 여기서만 막으면 DB 오류가 그대로
 * 500으로 나가고, DB에서만 막으면 사용자가 이유를 모른다.
 */
export function validateNoticeBody(body: NoticeWriteBody) {
  if (!body.title || !body.title.trim()) return "제목을 입력해 주세요.";
  if (body.title.trim().length > 200) return "제목은 200자 이하로 입력해 주세요.";
  if (!body.body || !body.body.trim()) return "내용을 입력해 주세요.";
  if (body.body.trim().length > 20000) return "내용은 20000자 이하로 입력해 주세요.";
  if (!isNoticeCategory(body.category)) return "분류를 선택해 주세요.";
  // 빈 값은 "초안으로 두기"라 통과시키고, 값이 있는데 날짜가 아니면 막는다.
  if (body.publishedAt && Number.isNaN(new Date(body.publishedAt).getTime())) return "발행 시각이 올바르지 않습니다.";
  return null;
}

export function toNoticeRow(body: NoticeWriteBody) {
  return {
    title: body.title!.trim(),
    body: body.body!.trim(),
    category: body.category,
    pinned: Boolean(body.pinned),
    published_at: body.publishedAt || null,
  };
}
