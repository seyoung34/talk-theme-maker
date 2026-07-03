# supabase

Database migration area for auth profiles, billing credits, export jobs, admin assets, and system template metadata.

## Rules

- Add forward-only migrations; do not edit committed historical migrations unless explicitly repairing local-only work.
- Keep RPC names and return shapes aligned with `lib/billing/credits.ts` and repository DTOs.
- Prefer least-privilege grants; service-role-only reads stay server-side.
- Schema changes that affect templates/assets/export jobs should update the matching TypeScript boundary in the same change.
- Do not create migrations that depend on local `.temp` state.

## Relevant Checks

- Migration-only changes: inspect SQL carefully; no Next build required by default.
- Migration plus TypeScript repository/API changes: `npx tsc --noEmit`.
