import crypto from "node:crypto";

const kid = process.argv[2] ?? `cf-oidc-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

const privateJwk = privateKey.export({ format: "jwk" });
const publicJwk = publicKey.export({ format: "jwk" });
const publicEntry = { kty: "RSA", use: "sig", alg: "RS256", kid, n: publicJwk.n, e: publicJwk.e };
const privateEntry = { ...privateJwk, alg: "RS256", kid };
const publicJwks = { keys: [publicEntry] };

console.log("CLOUDFLARE_OIDC_PRIVATE_JWK secret value:");
console.log(JSON.stringify(privateEntry));
console.log("");
console.log("CLOUDFLARE_OIDC_PUBLIC_JWKS variable value:");
console.log(JSON.stringify(publicJwks));
console.log("");
console.log("GCP --jwk-json-path file content:");
console.log(JSON.stringify(publicJwks, null, 2));
