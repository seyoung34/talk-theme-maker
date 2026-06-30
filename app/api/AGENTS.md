# app/api AGENTS.md

## OVERVIEW

Next.js route handlers for auth/session, export, billing/credits, admin credit codes, and theme asset signed URLs.

## STRUCTURE

```text
app/api/
├── export/android*/route.ts    # Android ZIP/APK/project exports
├── export/ios/route.ts         # iOS .ktheme export
├── billing/payapp/             # Payapp prepare/status/feedback
├── credits/redeem/             # Credit grant code redemption
├── admin/credit-codes/         # Admin credit code management
├── theme-assets/               # Recommended assets and signed URLs
├── me/route.ts                 # Account summary
└── session/route.ts            # Session lookup
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Export HTTP parsing | `export/*/route.ts` | Delegate package logic to `lib/theme` |
| Credit reservation/stages | `lib/billing/credits.ts` | Keep accounting outside route handler branches |
| Payapp flow | `billing/payapp/*`, `lib/billing/payapp.ts` | Feedback/status/prepare share provider assumptions |
| Auth/session | `me/route.ts`, `session/route.ts`, `lib/supabase/auth.ts` | Keep response DTOs stable |
| Signed theme assets | `theme-assets/*`, `lib/theme/server/themeAssetAccess.ts` | Service-role reads stay server-side |

## CONVENTIONS

- Route handlers own HTTP parsing, auth checks, status codes, and response shape.
- Business logic belongs in `lib/theme`, `lib/billing`, or `lib/supabase`.
- Export routes should update credit/export stages when server-side paid export is involved.
- Avoid caching authenticated/account/export responses unless the route explicitly proves it is safe.
- Validate request payloads before invoking expensive export/build work.

## ANTI-PATTERNS

- Do not duplicate Android/iOS export assembly inside route files.
- Do not expose Supabase service-role secrets or signed URL internals to client components.
- Do not return raw provider/Supabase errors directly when a stable app error code exists.
