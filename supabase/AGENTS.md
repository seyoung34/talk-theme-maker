# supabase

Database migration area for auth profiles, billing credits, export jobs, admin assets, and system template metadata.

## Rules

- Add forward-only migrations; do not edit committed historical migrations unless explicitly repairing local-only work.
- Keep RPC names and return shapes aligned with `lib/billing/credits.ts` and repository DTOs.
- Prefer least-privilege grants; service-role-only reads stay server-side.
- Grant `service_role` explicitly on every new table it touches. It inherits only `REFERENCES`, `TRIGGER`
  and `TRUNCATE` in this project, so anything reached through `createAdminClient()` otherwise fails with
  `42501 permission denied` at the table grant, before RLS is consulted.
- Enforce a value in both places when it has a user-facing message: a CHECK constraint plus the matching
  validation in `lib/`. The constraint alone turns a bad input into a 500; the code alone leaves the
  database open to a direct write.
- Schema changes that affect templates/assets/export jobs should update the matching TypeScript boundary in the same change.
- Do not create migrations that depend on local `.temp` state.

## Relevant Checks

- Any migration change: `npx supabase db reset` on the local stack (Docker Desktop must be running).
  It replays the whole chain from an empty database, which `db push` cannot do — `db push` only sends
  what is not yet applied. Run it before `npx supabase db push` reaches the linked project.
- RLS: query PostgREST directly with the anon key rather than checking through the UI. A screen that
  hides a row proves nothing about whether the database returns it to someone asking by id.
- Migration plus TypeScript repository/API changes: `npx tsc --noEmit`.
