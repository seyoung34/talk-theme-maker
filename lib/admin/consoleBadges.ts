import type { AdminConsoleBadges } from "@/components/admin/shell/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getOpsStatusSnapshot } from "@/lib/ops/repository";

/**
 * 답변할 문의 수.
 *
 * `status = 'open'`만 센다. ops RPC의 `open_inquiries`는 이미 답한 `answered`까지 포함해
 * 텔레그램 의미로는 맞지만 "답변할 문의"로는 과하게 센다. service role 조회이므로 호출부는
 * 관리자 확인을 통과한 뒤에만 부른다.
 */
export async function countOpenInquiries(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw error;
  if (typeof count !== "number") throw new Error("inquiry_count_missing");
  return count;
}

/** 사이드바 배지. 실패한 값은 비워 둔다 — 배지는 비어 있으면 숨으므로 실패가 "0건"처럼 보이지 않는다. */
export async function getAdminConsoleBadges(): Promise<AdminConsoleBadges> {
  const [inquiries, snapshot] = await Promise.allSettled([countOpenInquiries(), getOpsStatusSnapshot()]);
  return {
    ...(inquiries.status === "fulfilled" ? { openInquiries: inquiries.value } : {}),
    ...(snapshot.status === "fulfilled" ? { staleExports: snapshot.value.staleExports } : {}),
  };
}
