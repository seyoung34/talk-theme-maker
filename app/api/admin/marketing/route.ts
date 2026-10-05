import { NextResponse } from "next/server";
import { loadAdminMarketingReport } from "@/lib/admin/listData";
import { denyNonAdmin } from "@/lib/notices/adminApi";

export const dynamic = "force-dynamic";


/**
 * 주간 마케팅 지표.
 *
 * 집계는 전부 SQL 이 한다. 예전에는 행을 다 받아 앱에서 셌는데, Data API 의 1000행 제한에
 * 걸리면 **오류 없이 숫자만 작아진다.** 알아채기 어려운 형태의 결함이라 DB 로 내렸다.
 *
 * 주 경계·조회 범위·완료 시각 판정도 SQL 안에 있다(`Asia/Seoul` 기준). 앱과 DB 가 서로 다른
 * 시간대로 주를 자르면 경계 구간이 조용히 사라진다.
 */
export async function GET() {
  const denied = await denyNonAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ report: await loadAdminMarketingReport() });
  } catch (error) {
    console.error("주간 마케팅 지표 조회 실패", error);
    return NextResponse.json({ error: "지표를 불러오지 못했습니다." }, { status: 500 });
  }

}
