# Next route error contract

`next-route-error.json` records the production-mode Next 15.5.28 / OpenNext
1.20.6 local response for unexpected exceptions in both GET `/api/session`
and GET `/api/internal/ops/readiness`. Both returned status 500, an empty body,
no Content-Type or Set-Cookie, and the recorded Cache-Control and Vary.
Transport headers (`mf-content-encoding`, `transfer-encoding`) and OpenNext's
diagnostic `x-opennext: 1` are excluded: the direct handler is not OpenNext.

The local capture is preserved in ignored
`docs/report/w2-error-completion/verified-responses.json` and its four `.body` files
(recaptured after the final local Cloudflare build on 2026-10-26);
the fault-injection entry is `docs/report/w2-error-entry.mjs`.
It warms the actual generated Next session route, then makes `Response.json`
throw for session or authorization-header access throw for readiness, restoring
both globals in `finally`. Each path is fetched through Next and through the
direct handler (`?fast=1`), without any backend calls.

To repeat after a local `npm run cf:build`, use the CPU harness with fixture
environment only: set `CPU_ENTRY=docs/report/w2-error-entry.mjs`, a new
`CPU_OUTPUT`, and `CPU_ROUTES=session-unexpected-error,readiness-unexpected-error,session-fast-unexpected-error,readiness-fast-unexpected-error`;
run `node scripts/profile-worker-cpu.mjs prepare`, then `bundle`, then
`node --max-http-header-size=131072 scripts/profile-worker-cpu.mjs verify`.
The harness sanitizes generated environment files during prepare; rebuild
normally before using those build artifacts for an actual preview.

Unit tests inject the same faults and require the direct promise to resolve
to this captured HTTP contract exactly once, without logging the exception's
potentially sensitive message or retrying session work through Next.
