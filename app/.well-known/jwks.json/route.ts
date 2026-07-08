import { NextResponse } from "next/server";

type PublicJwk = JsonWebKey & { kid?: string; n?: string; e?: string };

export async function GET() {
  const jwks = readPublicJwks();
  if (jwks.keys.length === 0) {
    return NextResponse.json({ error: "JWKS is not configured." }, { status: 503 });
  }

  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

function readPublicJwks() {
  const raw = process.env.CLOUDFLARE_OIDC_PUBLIC_JWKS;
  if (!raw) {
    return { keys: [] };
  }

  try {
    const parsed = JSON.parse(raw) as { keys?: PublicJwk[] };
    if (!Array.isArray(parsed.keys)) return { keys: [] };
    return {
      keys: parsed.keys.map((key) => ({
        kty: key.kty,
        use: key.use,
        key_ops: key.key_ops,
        alg: key.alg,
        kid: key.kid,
        n: key.n,
        e: key.e,
      })),
    };
  } catch {
    return { keys: [] };
  }
}
