# app/api

Next.js route handlers for auth/session, exports, billing/credits, admin credit codes, and theme asset signed URLs.

## Rules

- Route handlers own HTTP parsing, auth checks, status codes, and response shape.
- Business logic belongs in `lib/theme`, `lib/billing`, or `lib/supabase`.
- Validate payloads before expensive export/build work.
- Keep credit/export stage updates aligned with `lib/billing/credits.ts`.
- Do not expose service-role secrets, signed URL internals, or raw provider errors when a stable app error code exists.

## Relevant Checks

- Route or DTO logic changes: `npx tsc --noEmit`.
- Export packaging route changes: add the relevant slot/export check; run `npm run build` only for broad route/config confidence.
