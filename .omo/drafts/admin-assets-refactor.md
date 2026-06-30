# admin-assets-refactor draft

status: awaiting-approval
intent: clear
review_required: false
tier: HEAVY
pending_action: write `.omo/plans/admin-assets-refactor.md`

## Skills

- `omo:ulw-plan`: requested by user; planning only, no product-code edits.
- `supabase`: DB schema/migration and RLS/storage access are in scope.

## Classification

HEAVY because the refactor crosses DB schema, Supabase storage/RLS/API routes, domain types, admin UI, and `/edit` consumption.

## Dirty Worktree

- Existing documentation changes from prior `init-deep`: root `AGENTS.md` modified and nested AGENTS files untracked.
- Plan must avoid touching or reverting those files unless the user asks.

## Evidence

- `components/admin/AdminAssetsClient.tsx:171`: common save currently loops over platform targets and calls `saveAdminAssetCandidate` per target.
- `lib/theme/adminAssets.ts:7`: `AdminAssetCandidate` is row-shaped around `slotRole`, `platform`, and one `storagePath`.
- `lib/theme/adminAssets.ts:130`: save uploads one storage object per admin asset row.
- `lib/theme/adminAssets.ts:231`: slot suitability is mostly client-side heuristic.
- `app/api/theme-assets/recommended/route.ts:12`: recommendation endpoint requires `platform + assetKind`, not `slotRole`.
- `supabase/migrations/202606180001_supabase_theme_storage.sql:39`: `admin_assets` stores platform/slot/file metadata in one table.
- `supabase/migrations/20260622162401_optimize_asset_template_listing.sql:1`: current index optimizes the row-shaped table, not target mappings.

## Topology

1. Schema: split file metadata from target mappings and bubble-only platform specs.
2. Domain/API: introduce asset DTOs that represent one file with many targets and server-side recommendation matching.
3. Admin UI: convert add/manage flow from platform row creation to one asset plus target/spec management.
4. Editor consumption: keep candidate selection behavior stable while consuming the new response shape.
5. Migration/backfill/compatibility: preserve existing rows and avoid destructive drops in the first wave.
6. Verification: migration checks, TypeScript checks, API route QA, admin browser QA, editor browser QA.

## Adopted Defaults

- Use additive compatibility migration first; do not drop or destructively rewrite existing `admin_assets` columns in the first implementation.
- New canonical model: one storage file per admin asset, target mapping rows for platform/slot applicability, bubble spec row for required Android/iOS values.
- Make bubble specs required only when `asset_kind = 'bubble'`; non-bubble assets do not carry bubble metadata.
- Server recommendation API should accept `platform`, `assetKind`, and optional `slotRole`; it should return exact target matches first, then broader kind/platform matches.
- Keep current signed URL access model but update access checks to validate canonical asset storage paths through the canonical assets table.
- No external dependency is needed.

## Approval Gate

If approved, write `.omo/plans/admin-assets-refactor.md` using the `ulw-plan` scaffold and include implementation waves, acceptance criteria, QA commands, and commit strategy. Approval authorizes plan writing only, not implementation.
