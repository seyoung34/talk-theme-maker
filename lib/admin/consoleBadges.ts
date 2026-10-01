import type { AdminConsoleBadges } from "@/components/admin/shell/navigation";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * 사이드바 배지 숫자.
 *
 * 문의 대기는 `status = 'open'`만 센다. ops RPC의 `open_inquiries`는 이미 답한 `answered`까지
 * 포함해 텔레그램 의미로는 맞지만 "답변할 문의"로는 과하게 센다.
 *
 * 실패한 값은 비워 둔다. 배지는 비어 있으면 숨으므로 조회 실패가 "0건"처럼 보이지 않는다.
 * 호출부는 관리자 확인을 통과한 뒤에만 부른다 — service role 조회다.
 */
export async function getAdminConsoleBadges(): Promise<AdminConsoleBadges> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    if (error) throw error;
    return typeof count === "number" ? { openInquiries: count } : {};
  } catch (error) {
    console.warn("Admin console badge lookup failed.", error);
    return {};
  }
}
