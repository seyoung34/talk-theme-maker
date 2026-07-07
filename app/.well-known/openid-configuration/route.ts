import { NextResponse } from "next/server";

export async function GET() {
  const issuer = process.env.CLOUDFLARE_OIDC_ISSUER;
  if (!issuer) {
    return NextResponse.json({ error: "OIDC issuer is not configured." }, { status: 503 });
  }

  return NextResponse.json(
    {
      issuer,
      jwks_uri: new URL("/.well-known/jwks.json", issuer).toString(),
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
