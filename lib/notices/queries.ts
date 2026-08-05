import { createClient } from "@/lib/supabase/server";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/config";
import { mapNoticeRow, noticeSelectColumns, type Notice } from "@/lib/notices/types";

/**
 * 공개된 공지만 읽는다.
 *
 * 초안(`published_at is null`)과 예약 발행분을 거르는 것은 RLS가 한다. 여기서 조건을 다시 쓰지
 * 않는 이유는, 두 곳에 같은 조건을 두면 한쪽만 고쳐졌을 때 비공개 글이 새기 때문이다.
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
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("공지 목록을 불러오지 못했습니다.", error);
    return [];
  }
  return (data ?? []).map(mapNoticeRow);
}

export async function getPublishedNotice(id: string): Promise<Notice | null> {
  if (!hasSupabaseBrowserConfig()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("notices").select(noticeSelectColumns).eq("id", id).maybeSingle();
  if (error) {
    console.error("공지를 불러오지 못했습니다.", error);
    return null;
  }
  return data ? mapNoticeRow(data) : null;
}
