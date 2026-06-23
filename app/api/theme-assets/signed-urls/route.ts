import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const bucketName = "theme-assets";
const maxPaths = 50;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paths?: unknown };
    const paths = Array.isArray(body.paths) ? Array.from(new Set(body.paths.filter((path): path is string => typeof path === "string" && path.length > 0))) : [];
    if (!paths.length || paths.length > maxPaths || paths.some(isInvalidPath)) {
      return NextResponse.json({ error: `1~${maxPaths}개의 올바른 경로가 필요합니다.` }, { status: 400 });
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();
    const { data: userData } = await supabase.auth.getUser();
    const isAdmin = userData.user
      ? Boolean((await supabase.from("admin_profiles").select("user_id").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle()).data)
      : false;

    if (paths.some((path) => path.startsWith("admin-assets/")) && !isAdmin) {
      return NextResponse.json({ error: "관리자 에셋 접근 권한이 없습니다." }, { status: 403 });
    }

    const systemPaths = paths.filter((path) => path.startsWith("system-templates/"));
    if (systemPaths.length && !isAdmin) {
      const variantIds = Array.from(new Set(systemPaths.map(getSystemTemplateVariantId).filter((id): id is string => Boolean(id))));
      if (variantIds.length === 0) return NextResponse.json({ error: "올바르지 않은 템플릿 경로입니다." }, { status: 400 });

      const { data: variants, error } = await adminClient
        .from("system_template_variants")
        .select("id,system_template_bundles!inner(status,visibility)")
        .in("id", variantIds);
      if (error) throw error;
      const publicIds = new Set(
        (variants ?? [])
          .filter((variant) => {
            const bundle = Array.isArray(variant.system_template_bundles) ? variant.system_template_bundles[0] : variant.system_template_bundles;
            return bundle?.status === "published" && bundle?.visibility === "public";
          })
          .map((variant) => variant.id),
      );
      if (variantIds.some((id) => !publicIds.has(id))) {
        return NextResponse.json({ error: "공개되지 않은 템플릿 에셋입니다." }, { status: 403 });
      }
    }

    if (paths.some((path) => !path.startsWith("admin-assets/") && !path.startsWith("system-templates/"))) {
      return NextResponse.json({ error: "지원하지 않는 Storage 경로입니다." }, { status: 400 });
    }

    const { data, error } = await adminClient.storage.from(bucketName).createSignedUrls(paths, 60 * 10);
    if (error) throw error;
    const signedUrls = Object.fromEntries((data ?? []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
    return NextResponse.json({ signedUrls });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signed URL 생성에 실패했습니다." }, { status: 500 });
  }
}

function isInvalidPath(path: string) {
  return path.length > 512 || path.includes("..") || path.startsWith("/") || path.includes("\\");
}

function getSystemTemplateVariantId(path: string) {
  const id = path.split("/")[1];
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
