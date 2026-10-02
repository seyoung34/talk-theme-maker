import { redirect } from "next/navigation";

/** 주간 지표는 분석 화면으로 옮겼다. 마케팅 문서·북마크에 남은 옛 주소를 살린다. */
export default function AdminMarketingRedirect() {
  redirect("/admin/analytics");
}
