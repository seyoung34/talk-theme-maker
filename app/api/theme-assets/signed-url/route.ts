import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const bucketName = "theme-assets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { path } = (await request.json()) as { path?: string };
    if (!path || path.includes("..")) {
      return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();
    const { data: userData } = await supabase.auth.getUser();
    const isAdmin = userData.user
      ? Boolean((await supabase.from("admin_profiles").select("user_id").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle()).data)
      : false;

    if (path.startsWith("admin-assets/") && !isAdmin) {
      return NextResponse.json({ error: "Admin asset access requires admin privileges." }, { status: 403 });
    }

    if (path.startsWith("system-templates/") && !isAdmin) {
      const variantId = path.split("/")[1];
      if (!variantId || !/^[0-9a-f-]{36}$/i.test(variantId)) {
        return NextResponse.json({ error: "Invalid template asset path." }, { status: 400 });
      }
      const { data: variant, error } = await adminClient
        .from("system_template_variants")
        .select("id,system_template_bundles!inner(status,visibility)")
        .eq("id", variantId)
        .maybeSingle();
      if (error) throw error;
      const bundle = Array.isArray(variant?.system_template_bundles) ? variant.system_template_bundles[0] : variant?.system_template_bundles;
      const isPublicTemplateAsset = bundle?.status === "published" && bundle?.visibility === "public";

      if (!isPublicTemplateAsset) {
        return NextResponse.json({ error: "Template asset is not public." }, { status: 403 });
      }
    }

    if (!path.startsWith("admin-assets/") && !path.startsWith("system-templates/")) {
      return NextResponse.json({ error: "Unsupported storage path." }, { status: 400 });
    }

    const { data, error } = await adminClient.storage.from(bucketName).createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signed URL creation failed." }, { status: 500 });
  }
}
