# supabase AGENTS.md

## OVERVIEW

Database migration area for auth profiles, billing credits, export jobs, admin assets, and system template metadata.

## STRUCTURE

```text
supabase/
├── migrations/                 # Forward-only SQL migration history
└── .temp/                      # Local Supabase CLI metadata
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Theme storage | `migrations/202606180001_supabase_theme_storage.sql` | Initial theme asset/template storage |
| System template previews | `202606180002_*`, `20260624122244_*` | Metadata and base-template enforcement |
| Billing/export credits | `202606180003_*`, `20260622081713_*`, `20260622083854_*` | Credit reservation and export jobs |
| Credit grant codes | `20260620083612_*` through `20260620090109_*` | Code digest and function hardening |
| Asset/template listing | `20260622162401_*`, `20260623131000_*` | Admin asset read/listing performance and grants |
| Export identity | `20260623045617_*`, `20260623081500_*` | Android application IDs and iOS identifiers |

## CONVENTIONS

- Add new migrations; do not edit committed historical migrations unless explicitly repairing local-only work.
- Keep RPC names and return shapes aligned with `lib/billing/credits.ts` and Supabase repository code.
- Prefer least-privilege grants; service-role-only reads should remain server-side.
- When schema changes affect templates/assets/export jobs, update the matching TypeScript DTO/repository boundary in the same change.
- Use explicit timestamps and descriptive migration names.

## ANTI-PATTERNS

- Do not put business rules only in client code when the DB function enforces credits/export identity.
- Do not grant broad table access to anon/authenticated roles to make a UI call pass.
- Do not create migrations that depend on local `.temp` state.
