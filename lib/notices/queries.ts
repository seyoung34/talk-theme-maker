import { createClient } from "@/lib/supabase/server";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/config";
import { mapNoticeRow, noticeSelectColumns, type Notice } from "@/lib/notices/types";

/**
 * 공개된 공지만 읽는다.
 *
 * 발행 조건을 **쿼리에도 쓴다.** RLS의 "Public reads published notices"가 익명·일반 사용자에게는
 * 이 조건을 강제하지만, 관리자에게는 "Admins manage notices"가 `for all`로 걸려 있어 초안과
 * 예약 발행분까지 SELECT가 통과한다. 조건이 RLS에만 있으면 관리자가 `/notice`를 열었을 때
 * 미발행 공지가 그대로 노출된다.
 *
 * Supabase가 설정되지 않은 환경(e2e 빌드 등)에서는 빈 목록을 돌려준다. 공지는 서비스의 부가
 * 기능이라 여기서 예외를 던지면 페이지 전체가 죽는다.
 */
export async function listPublishedNotices(limit = 50): Promise<Notice[]> {
  if (!hasSupabaseBrowserConfig()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .select(noticeSelectColumns)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("공지 목록을 불러오지 못했습니다.", error);
    return [];
  }
  return (data ?? []).map(mapNoticeRow);
}

/** 목록과 같은 이유로 발행 조건을 명시한다. 관리자도 `/notice`에서는 공개본만 본다. */
export async function getPublishedNotice(id: string): Promise<Notice | null> {
  if (!hasSupabaseBrowserConfig()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notices")
    .select(noticeSelectColumns)
    .eq("id", id)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error("공지를 불러오지 못했습니다.", error);
    return null;
  }
  return data ? mapNoticeRow(data) : null;
}
