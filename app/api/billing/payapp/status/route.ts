import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserOrNull } from "@/lib/billing/credits";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다.", reason: "unauthenticated" }, { status: 401 });
  const paymentId = request.nextUrl.searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "paymentId가 필요합니다." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("payments").select("id,order_id,amount,credits,status,provider_payment_id,checkout_url,receipt_url,created_at,updated_at").eq("id", paymentId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: "결제 요청을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ payment: data });
}
