import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAdminClient } from "@/lib/supabase/server";
import { hasSupabaseBrowserConfig } from "@/lib/supabase/config";
import { buildMarketingDestination, getMarketingLink } from "@/lib/marketing/links";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * 홍보 단축 링크.
 *
 *   /r/ig  →  302  →  /?utm_source=instagram&utm_medium=social&utm_campaign=...
 *
 * 두 가지를 동시에 푼다.
 *
 * 1. **길이** — 원본 UTM 링크는 100자가 넘어 인스타 바이오·카카오톡·문자·QR 에서 불리하다.
 * 2. **동의 없이 세는 리디렉션 요청** — GA4 는 분석 쿠키에 동의한 방문자만 센다. 여기서는
 *    서버가 리다이렉트 요청을 관측해 하루치 카운터만 올린다. 고유 사용자나 사람의 실제 클릭을
 *    보장하는 수치가 아니며, 중복 요청·봇·링크 미리보기가 섞일 수 있다.
 *    개인 식별자·IP·User-Agent 는 저장하지 않는다.
 *
 * 목적지와 캠페인은 `lib/marketing/links.ts` 대장에서만 온다. 경로에 들어온 코드는 대장의
 * 키로만 쓰이므로, 임의 URL 로 넘기는 오픈 리다이렉트가 될 수 없다.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;
  const link = getMarketingLink(code);
  // 모르는 코드는 홈으로 보낸다. 오타나 만료된 링크로 404 를 보여줄 이유가 없다 —
  // 이 링크를 누른 사람은 서비스를 보러 온 것이다.
  if (!link) return NextResponse.redirect(new URL("/", request.url), 302);

  const destination = buildMarketingDestination(new URL(request.url).origin, link);

  if (hasSupabaseBrowserConfig()) {
    const record = (async () => {
      try {
        const { error } = await createAdminClient().rpc("record_marketing_link_hit", {
          p_code: code.trim().toLowerCase(),
          p_source: link.source,
          p_medium: link.medium,
          p_campaign: link.campaign,
        });
        if (error) console.error("홍보 링크 요청을 기록하지 못했습니다.", error);
      } catch (error) {
        console.error("홍보 링크 요청을 기록하지 못했습니다.", error);
      }
    })();

    // **응답을 기다리게 하지 않는다.** 통계는 부수적이고 방문이 본질이라, Supabase 가 느리면
    // 링크 자체가 느려지거나 타임아웃으로 리다이렉트를 놓칠 수 있다. Workers 는 응답 후
    // 남은 작업을 끊으므로 waitUntil 로 넘겨 끝까지 돌게 한다.
    waitUntil(record);
  }

  const response = NextResponse.redirect(destination, 302);
  // 중간 캐시가 리다이렉트를 대신 응답하면 요청이 세어지지 않는다.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Workers 밖(로컬 `next dev`·테스트)에서는 컨텍스트가 없다. 그때는 그냥 놓아둔다. */
function waitUntil(task: Promise<unknown>) {
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    void task;
  }
}
