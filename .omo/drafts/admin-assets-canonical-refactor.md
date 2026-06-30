---
slug: admin-assets-canonical-refactor
status: drafting
intent: clear
pending-action: write .omo/plans/admin-assets-canonical-refactor.md
approach: additive compatibility migration, canonical asset model, target mapping, bubble platform spec enforcement, server-side recommendation matching, admin/editor UI adaptation
---

# Draft: admin-assets-canonical-refactor

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id | outcome | status | evidence path |
| --- | --- | --- | --- |
| schema | Canonical admin asset storage separates file metadata, target applicability, and bubble specs. | active | `supabase/migrations/202606180001_supabase_theme_storage.sql:39`, `supabase/migrations/20260622162401_optimize_asset_template_listing.sql:1` |
| domain-api | `lib/theme/adminAssets.ts` and `/api/theme-assets/recommended` expose one asset with many targets and server-side matching. | active | `lib/theme/adminAssets.ts:7`, `app/api/theme-assets/recommended/route.ts:12` |
| admin-ui | Admin add/manage flow saves one file once and manages applicability plus required bubble values. | active | `components/admin/AdminAssetsClient.tsx:171`, `components/admin/AdminAssetsClient.tsx:500` |
| editor-consumption | `/edit` keeps current candidate UX while consuming canonical recommendation payloads. | active | `components/project/hooks/useProjectAssetUploads.ts:1`, `components/project/ProjectImporterClient.tsx:634` |
| verification | Migration, type, API, admin browser, and editor browser proof cover regressions. | active | `AGENTS.md:90` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Migration style | Additive compatibility migration first, no destructive drops. | Existing data and dirty worktree should survive; old paths can keep working during transition. | Yes |
| Canonical unit | One `admin_assets` row means one uploaded file. | Removes platform duplicate DB rows and Storage objects. | Hard after migration, but still backward-compatible through views/adapters |
| Applicability | Store platform/slot applicability in `admin_asset_targets`. | Server can answer “what fits this slot” without client-only heuristics. | Yes |
| Bubble contract | Bubble assets require Android markers and iOS insets/stretch in a separate spec row. | User identified bubbles as the only platform-specific asset management case. | Yes |
| Recommendation API | Accept `platform`, `assetKind`, optional `slotRole`; return exact target matches before broader matches. | Preserves current browsing while improving server/DB efficiency. | Yes |
| Dependencies | No new external package. | Existing Supabase/Next stack is enough. | Yes |

## Findings (cited - path:lines)

- Current admin UI tracks both current platform and `assetPlatformScope`, but selected save targets become multiple row saves when scope is `all`: `components/admin/AdminAssetsClient.tsx:35`, `components/admin/AdminAssetsClient.tsx:62`, `components/admin/AdminAssetsClient.tsx:171`.
- Current DB row combines `slot_role`, `platform`, `asset_kind`, `analysis`, `bubble_adjustment`, and `storage_path` into one `admin_assets` record: `supabase/migrations/202606180001_supabase_theme_storage.sql:39`.
- Current domain type mirrors the row shape: `AdminAssetCandidate` has `slotRole`, `platform`, `assetKind`, `analysis`, `bubbleAdjustment`, and one `storagePath`: `lib/theme/adminAssets.ts:7`.
- Current save path uploads one Storage object per saved admin asset row: `lib/theme/adminAssets.ts:130`.
- Current recommendation API filters by `platform + assetKind`, not by exact slot applicability: `app/api/theme-assets/recommended/route.ts:12`.
- Current client heuristic decides many slot recommendations after fetch: `lib/theme/adminAssets.ts:231`.
- Current editor consumes admin candidates as uploaded files and applies bubble adjustment values when present: `components/project/ProjectImporterClient.tsx:634`.

## Decisions (with rationale)

- Keep `admin_assets` as the public concept name but migrate it toward canonical file metadata. Do not drop old columns in the first pass; either keep them nullable for compatibility or use a compatibility view/helper during the transition.
- Add `admin_asset_targets` with `asset_id`, `platform`, `slot_role`, `target_kind`, `priority`, and `enabled`. Exact `slot_role` rows rank above `asset_kind`/shape-style broad targets.
- Add `admin_asset_bubble_specs` with `asset_id` and required `android_markers`, `ios_insets`, `ios_stretch`. The domain layer rejects bubble assets without a complete spec.
- Update the recommendation route to join canonical assets to targets and signed URLs server-side, preserving stable pagination.
- Keep client-side `isAdminAssetRecommendedForSlot` only as a fallback/visual warning helper, not as the primary eligibility source.
- Split large UI changes out of `AdminAssetsClient.tsx` only when needed to stay below current complexity; avoid unrelated visual redesign.

## Scope IN

- Supabase migration for canonical admin asset tables/indexes/backfill.
- TypeScript domain types and read/write helpers for canonical assets.
- Recommendation API request/response shape and access checks.
- Admin asset add/edit/delete/list UI flow.
- `/edit` admin asset candidate loading and selection compatibility.
- Agent-run tests and real-surface QA.

## Scope OUT (Must NOT have)

- No destructive drop of existing `admin_assets` data in first implementation.
- No public marketplace or paid template behavior.
- No broad redesign of editor/admin visual style.
- No changes to export identity, credits, Payapp, or system template publishing beyond asset refs required by this refactor.
- No new third-party dependency unless the implementation proves existing stack cannot parse/validate the new boundary safely.

## Open questions

- None blocking. The plan adopts reversible defaults above.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

User approved with: "진행해줘".
