# admin-assets-canonical-refactor - Work Plan

## TL;DR (For humans)
**What you'll get:** Admin assets will be managed as one reusable uploaded asset with clear platform/slot targets, so shared images do not need duplicate Android/iOS records. Bubble assets will be the special case: they must carry both Android and iOS adjustment values before they can be saved.

**Why this approach:** It moves applicability into data instead of client-side guessing, while keeping the first migration additive so existing assets are preserved. It also matches the product model: most assets are platform-common, and bubbles are the only asset class with real platform-specific editing metadata.

**What it will NOT do:** It will not drop existing asset data, redesign unrelated admin/editor surfaces, or change billing/export identity/template marketplace behavior.

**Effort:** Large
**Risk:** High - schema, storage access, server API, admin UI, and editor consumption all change together.
**Decisions to sanity-check:** Additive migration first; canonical asset plus target rows; required bubble specs only for bubble assets; no new dependency.

Your next move: use `$start-work` or ask for a high-accuracy plan review first. Full execution detail follows below.

---

> TL;DR (machine): Large/high-risk cross-boundary refactor: normalize admin asset storage, add target/spec tables, update API/UI/editor, and verify with DB/API/browser QA.

## Scope
### Must have
- Add a forward-only Supabase migration that introduces canonical admin asset storage without dropping existing data.
- Represent one uploaded admin asset file once, with target mappings for platform/slot applicability.
- Enforce complete platform-specific bubble values only for bubble assets: Android markers plus iOS insets/stretch.
- Move recommendation eligibility into the server/API path while keeping client-side warning heuristics.
- Refactor admin asset add/manage flow so “Android/iOS 둘 다” creates one asset with two targets, not duplicate files/rows.
- Keep `/edit` candidate selection behavior stable, including applying bubble adjustment values after selecting an admin bubble asset.
- Verify with migration/schema checks, encoding checks, TypeScript checks, API checks, and browser QA for admin and editor surfaces.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not drop or rewrite existing `admin_assets` rows destructively in the first migration.
- Do not touch unrelated billing, export identity, Payapp, or system template marketplace logic.
- Do not rely on client-only filtering as the primary recommendation mechanism after the refactor.
- Do not weaken RLS or expose service-role-only data to browser code.
- Do not rewrite large TSX files wholesale; patch narrowly or extract focused helpers/components.
- Do not add a new external dependency unless existing code cannot meet the boundary parsing/validation requirement.
- Do not create commits unless the user explicitly starts implementation and asks or preauthorizes committing.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: script-backed TDD/characterization because this repo has no `test` script. Add focused Node verification scripts under `scripts/` only when a pure/domain/API contract needs red→green proof; otherwise use route/API/browser scenarios as real-surface proof.
- Evidence root: `.omo/evidence/admin-assets-canonical-refactor/`.
- Local setup prerequisites:
  - If `supabase/config.toml` exists and local Docker/Supabase is available, use `npx supabase db reset --local`.
  - If local Supabase is unavailable, derive the hosted project ref from `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` (`https://<project-ref>.supabase.co`). Apply DDL/migration SQL through the Supabase MCP `apply_migration`/`_apply_migration` tool with `{ project_id: "<project-ref>", name: "<migration-name>", query: "<ddl sql>" }`, then run verification/assertion SQL through `_execute_sql`.
  - If neither local Supabase nor Supabase MCP migration tools are available, DB migration verification is blocked. Record the missing tool/env as blocked evidence; do not attempt DDL through `supabase-js` REST and do not fake DB evidence.
  - Browser QA must create its own admin session. Add a temporary QA seed script under `scripts/` that reads `.env.local`, uses `SUPABASE_SECRET_KEY` to create or update `admin-assets-qa@example.com` with password `AdminAssetsQa-2026!`, and upserts that user into `public.admin_profiles`. Delete or leave the script only if it is a reusable verification script documented in Todo 7.
- Seed data requirements for API/browser QA:
  - Admin test account: `admin-assets-qa@example.com` / `AdminAssetsQa-2026!` created by the QA seed script, then used in browser QA login.
  - One enabled exact bubble asset target for `platform='android'`, `slot_role='bubble_me_1'`.
  - One enabled broad bubble asset target for `platform='all'`, `slot_role is null`, `target_kind='asset_kind'`.
  - One disabled bubble asset target and one nonmatching icon/background target.
  - One non-bubble shared asset with Android+iOS targets for admin UI coverage.
- Required command gates:
  - `npm run check:text`
  - `npm run check:ios-slots`
  - `npm run check:android-colors`
  - `npx tsc --noEmit`
  - `npm run build`
- API QA channel:
  - Tool/invocation: `curl -i "http://127.0.0.1:<port>/api/theme-assets/recommended?platform=android&assetKind=bubble&slotRole=bubble_me_1&limit=5"`
  - PASS: HTTP 200 and JSON `items.length >= 2`; exact `bubble_me_1` match appears before broad bubble target; disabled/nonmatching assets are absent.
  - Failure scenario: `curl -i "http://127.0.0.1:<port>/api/theme-assets/recommended?platform=windows&assetKind=bubble"` returns HTTP 400.
- Browser QA channel:
  - Admin page: start at `/admin-login`, sign in with `admin-assets-qa@example.com` / `AdminAssetsQa-2026!`, navigate to `/admin/assets`; upload one non-bubble image with “Android/iOS 둘 다”; observe one asset card with both target badges, not duplicate file cards.
  - Bubble page path: upload bubble asset; attempt save before complete spec must be blocked; after Android/iOS values are present, save succeeds.
  - Editor page: drive `/edit`, choose a slot, load recommended admin assets, select one, observe upload candidate selected and bubble values applied for bubble slots.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: Schema/domain/API contract. Todos 1-3 are parallelizable after Todo 1 migration shape is drafted.
- Wave 2: Admin UI and editor consumption. Todos 4-5 depend on the domain/API shape from Wave 1.
- Wave 3: Compatibility cleanup and end-to-end verification. Todos 6-7 depend on Waves 1-2.

### Canonical schema decisions
- `admin_assets`: canonical uploaded file metadata. Existing legacy columns may remain nullable during migration, but new writes treat the row as one file, not one platform/slot candidate.
- `admin_asset_targets.target_kind`: enum/check values:
  - `exact_role`: `slot_role` is required; only that role is an exact match.
  - `asset_kind`: `slot_role` must be null; applies to all slots of the same `asset_kind` after platform match.
  - `shape_rule`: `slot_role` must be null; applies through server-side shape/category rules only if implemented in the same change. If not implemented, do not insert this value.
- `admin_asset_targets.platform`: allowed values are `android`, `ios`, `all`. New “both platform” saves should prefer one `platform='all'` broad target when the slot role is genuinely shared, and two exact targets only when exact platform-specific slot roles differ. The UI may display this as Android+iOS coverage.
- `admin_asset_bubble_specs` exact JSON contract:
  - `android_markers`: same shape as current `Markers` with `top/left/right/bottom` ranges.
  - `ios_insets`: same shape as current `Insets` with `top/right/bottom/left`.
  - `ios_stretch`: same shape as current `StretchPoint` with `x/y`.
  - compatibility adapter maps to current `bubbleAdjustment` as `{ markers: android_markers, insets: ios_insets, stretch: ios_stretch }`.
- Legacy duplicate policy: do not attempt cross-row binary deduplication in the first migration. Existing duplicate Android/iOS rows become separate canonical assets with one target each. New saves must not create duplicates.
- Recommendation ordering/cursor: sort by `match_rank asc`, `target.priority desc`, `asset.updated_at desc`, `asset.id desc`, where `match_rank` is `0 exact_role`, `1 asset_kind`, `2 shape_rule`. Cursor must encode all sort keys needed to avoid duplicates/skips, for example `match_rank|priority|updated_at|asset_id`.
- QA SQL target: executor must first inspect `.env.local`. If `NEXT_PUBLIC_SUPABASE_URL` is set, the project id is the hostname prefix before `.supabase.co`; use that id with Supabase MCP `apply_migration`/`_apply_migration` for hosted DDL and `_execute_sql` only for hosted assertions/negative-test queries. If `.env.local` is absent/incomplete or MCP migration tooling is unavailable, mark DB/browser QA blocked with the missing env/tool and do not fake evidence.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 5, 6 | none |
| 2 | 1 | 3, 4, 5, 6 | 3 after schema names settle |
| 3 | 1, 2 | 4, 5, 6 | none |
| 4 | 2, 3 | 6, 7 | 5 |
| 5 | 2, 3 | 6, 7 | 4 |
| 6 | 4, 5 | 7 | none |
| 7 | 1, 2, 3, 4, 5, 6 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Add canonical admin asset migration and backfill contract
  What to do / Must NOT do: Create a new Supabase migration using `npx supabase migration new <name>`; add canonical tables/indexes/RLS/grants and a backfill path from existing `admin_assets`. Do not drop old columns/data. Add `admin_asset_targets(asset_id uuid references public.admin_assets(id) on delete cascade, platform text check in ('android','ios','all'), slot_role text null, target_kind text check in ('exact_role','asset_kind','shape_rule'), priority integer not null default 0, enabled boolean not null default true)` and `admin_asset_bubble_specs(asset_id uuid primary key references public.admin_assets(id) on delete cascade, android_markers jsonb not null, ios_insets jsonb not null, ios_stretch jsonb not null)`. Keep `admin_assets` as file metadata canonical source, retaining legacy columns nullable/compatible during the first wave if needed.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6
  References (executor has NO interview context - be exhaustive): `supabase/AGENTS.md`; `supabase/migrations/202606180001_supabase_theme_storage.sql:39`; `supabase/migrations/20260622162401_optimize_asset_template_listing.sql:1`; `supabase/migrations/20260623131000_grant_admin_assets_service_read.sql:3`; `docs/supabase-setup.md:16`; `lib/theme/adminAssets.ts:70`.
  Acceptance criteria (agent-executable): migration file exists; SQL contains no `drop table admin_assets` and no destructive `delete from admin_assets`; RLS is enabled on both new tables; authenticated admin policies mirror `public.is_admin()` for all operations; service_role has select for recommendation APIs; backfill creates at least one target per existing enabled asset; bubble rows are inserted for existing bubble assets with complete legacy `bubble_adjustment`; indexes cover `(enabled, asset_kind, updated_at desc, id desc)` and target lookup `(platform, slot_role, enabled, priority desc)`.
  QA scenarios (name the exact tool + invocation): Happy: if local Supabase exists, `npx supabase db reset --local`; otherwise parse `.env.local` for `NEXT_PUBLIC_SUPABASE_URL`, derive `<project-ref>`, call Supabase MCP `_apply_migration({ project_id: "<project-ref>", name: "<migration-name>", query: "<ddl sql>" })`, then call `_execute_sql({ project_id: "<project-ref>", query: "<assertion sql>" })` for count/assertion SQL against `admin_assets`, `admin_asset_targets`, `admin_asset_bubble_specs`, evidence `.omo/evidence/admin-assets-canonical-refactor/task-1-db-reset-or-sql.txt`. Failure: run `_execute_sql` SQL inserts that violate `target_kind/slot_role` rules and bubble `not null` spec columns; they must fail, evidence `.omo/evidence/admin-assets-canonical-refactor/task-1-constraints.txt`.
  Commit: Y | `feat(db): normalize admin asset storage`

- [ ] 2. Refactor admin asset domain types and repository helpers
  What to do / Must NOT do: Update `lib/theme/adminAssets.ts` around canonical types. Introduce explicit types for canonical asset, target, recommendation item, and bubble spec. Parse API/database payloads at boundaries into typed objects. Keep a compatibility adapter so existing editor selection can still receive `AdminAssetCandidate`-like fields until UI migration completes. For save/update, if Storage upload succeeds but DB write fails, remove the newly uploaded object before rethrowing. Do not use `any`, `@ts-ignore`, or non-null assertions.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4, 5, 6
  References: `lib/theme/AGENTS.md`; `lib/theme/adminAssets.ts:7`; `lib/theme/adminAssets.ts:92`; `lib/theme/adminAssets.ts:130`; `lib/theme/adminAssets.ts:167`; `lib/theme/adminAssets.ts:231`; `lib/theme/remoteAssets.ts:1`; `lib/theme/server/themeAssetAccess.ts:1`.
  Acceptance criteria: new domain helpers can save one asset with multiple targets and return one signed URL; update supports title/enabled/targets/bubble spec without duplicating storage files; delete removes one canonical asset and its target/spec rows; compatibility adapter maps `bubbleSpec` to `bubbleAdjustment = { markers: android_markers, insets: ios_insets, stretch: ios_stretch }`; compatibility adapter preserves `id`, representative `slotRole`, representative `platform`, `assetKind`, `storagePath`, `previewUrl`, and `bubbleAdjustment` fields for old consumers.
  QA scenarios: Happy: create script-backed assertions for canonical row mapping and compatibility mapping, run `node scripts/<new-admin-assets-verification>.mjs` and `npx tsc --noEmit`, evidence `.omo/evidence/admin-assets-canonical-refactor/task-2-domain-script.txt` and `task-2-tsc.txt`. Failure: script asserts malformed bubble spec and missing title are rejected before database write, evidence `.omo/evidence/admin-assets-canonical-refactor/task-2-invalid-input.txt`.
  Commit: Y | `refactor(theme): model admin assets as canonical files`

- [ ] 3. Move recommendation matching into the server API
  What to do / Must NOT do: Update `app/api/theme-assets/recommended/route.ts` to accept `platform`, `assetKind`, optional `slotRole`, `limit`, and `cursor`. Query canonical assets joined to targets/specs; rank exact `slotRole` target above broad target; include signed URLs; preserve cursor pagination. Do not expose service role keys or raw Supabase errors.
  Parallelization: Wave 1 | Blocked by: 1, 2 | Blocks: 4, 5, 6
  References: `app/api/AGENTS.md`; `app/api/theme-assets/recommended/route.ts:12`; `app/api/theme-assets/recommended/route.ts:21`; `app/api/theme-assets/recommended/route.ts:52`; `lib/theme/server/themeAssetAccess.ts:44`; `lib/theme/remoteAssets.ts:14`; `components/project/hooks/useProjectAssetUploads.ts:35`.
  Acceptance criteria: valid requests return enabled matching assets only; invalid platform/assetKind returns 400; response contains canonical target metadata and compatibility fields; exact target appears before broad target; cursor encodes `match_rank|priority|updated_at|asset_id` or equivalent full sort tuple; no client-side service role use.
  QA scenarios: Happy: with seeded exact, broad, disabled, and nonmatching assets, `curl -i "http://127.0.0.1:<port>/api/theme-assets/recommended?platform=android&assetKind=bubble&slotRole=bubble_me_1&limit=5"` returns 200, `items.length >= 2`, exact before broad, disabled absent; evidence `.omo/evidence/admin-assets-canonical-refactor/task-3-api-happy.txt`. Failure: `curl -i "http://127.0.0.1:<port>/api/theme-assets/recommended?platform=windows&assetKind=bubble"` returns 400, evidence `.omo/evidence/admin-assets-canonical-refactor/task-3-api-invalid.txt`.
  Commit: Y | `feat(api): serve canonical admin asset recommendations`

- [ ] 4. Refactor admin asset add/manage UI around one asset plus targets
  What to do / Must NOT do: Update `components/admin/AdminAssetsClient.tsx` and extract helpers/components if needed. The admin flow should upload one file once, select target scope (`all`, platform, exact slots), and save one canonical asset with multiple target rows. For bubble assets, block save until Android markers and iOS insets/stretch are complete. Card/list UI should show target coverage instead of duplicate cards. Do not redesign unrelated admin screens.
  Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: 6, 7 | Can parallelize with: 5
  References: `components/admin/AdminAssetsClient.tsx:35`; `components/admin/AdminAssetsClient.tsx:56`; `components/admin/AdminAssetsClient.tsx:62`; `components/admin/AdminAssetsClient.tsx:91`; `components/admin/AdminAssetsClient.tsx:171`; `components/admin/AdminAssetsClient.tsx:500`; `components/admin/AdminAssetsClient.tsx:620`; `components/editor/InlineBubbleAdjuster.tsx:1`; `lib/theme/adminAssets.ts:64`.
  Acceptance criteria: saving with “Android/iOS 둘 다” calls one canonical save operation and creates one `platform='all'` target or two exact targets only when role mapping differs; bubble save is disabled/rejected without complete platform specs; editing an asset can update title, enabled state, target rows, and bubble spec; deleting one asset removes one card and one storage path.
  QA scenarios: Happy Browser: run the QA seed script to create `admin-assets-qa@example.com`; start dev server; open `/admin-login`; sign in with `admin-assets-qa@example.com` / `AdminAssetsQa-2026!`; navigate to `/admin/assets`; upload a non-bubble image; select both platforms; save; observe one card with both targets, screenshot `.omo/evidence/admin-assets-canonical-refactor/task-4-admin-happy.png` and action log `.omo/evidence/admin-assets-canonical-refactor/task-4-admin-happy.log`. Failure Browser: after the same login, open bubble flow, remove/omit one required spec value, save remains disabled or shows validation error, screenshot `.omo/evidence/admin-assets-canonical-refactor/task-4-bubble-invalid.png`.
  Commit: Y | `refactor(admin): manage asset targets from one upload`

- [ ] 5. Update editor recommendation consumption without changing selection UX
  What to do / Must NOT do: Update `components/project/hooks/useProjectAssetUploads.ts`, `components/project/ProjectImporterClient.tsx`, and `components/project/projectModel.ts` only as needed so `/edit` sends `slotRole` to the recommendation API and consumes canonical recommendations. Preserve current behavior: selecting admin asset creates an upload entry, candidate selection uses asset id, and bubble spec applies markers/insets/stretch.
  Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: 6, 7 | Can parallelize with: 4
  References: `components/project/AGENTS.md`; `components/project/hooks/useProjectAssetUploads.ts:20`; `components/project/hooks/useProjectAssetUploads.ts:35`; `components/project/ProjectImporterClient.tsx:634`; `components/project/ProjectImporterClient.tsx:647`; `components/project/projectModel.ts:1`; `lib/theme/project/state.ts`.
  Acceptance criteria: `/edit` recommendation fetch includes `slotRole`; recommended list still appears for image/ninepatch slots; selecting a bubble asset applies `android_markers`/`ios_insets`/`ios_stretch` through the compatibility bubble adjustment object consumed at `ProjectImporterClient.tsx:647`; no color slot fetch is introduced.
  QA scenarios: Happy Browser: open `/edit`, select a bubble slot, observe recommended assets load, select one, verify chosen candidate appears selected and bubble controls reflect stored values, evidence `.omo/evidence/admin-assets-canonical-refactor/task-5-editor-happy.png` plus log. Failure Browser/API: select a color slot or invalid platform path and verify no recommendation fetch or API returns 400, evidence `.omo/evidence/admin-assets-canonical-refactor/task-5-editor-failure.txt`.
  Commit: Y | `refactor(editor): consume canonical admin recommendations`

- [ ] 6. Remove compatibility duplication and tighten access checks
  What to do / Must NOT do: After UI/editor paths are canonical, remove or quarantine legacy duplicate-row write paths. Update `checkThemeAssetStorageAccess` so non-admin access to `admin-assets/` paths checks canonical enabled assets and targets, not stale duplicate rows. Keep legacy read compatibility only if existing system templates/user data may still reference old ids. Do not weaken RLS grants.
  Parallelization: Wave 3 | Blocked by: 4, 5 | Blocks: 7
  References: `lib/theme/server/themeAssetAccess.ts:44`; `lib/theme/adminAssets.ts:189`; `lib/theme/remoteAssets.ts:14`; `supabase/migrations/202606180001_supabase_theme_storage.sql:101`; `supabase/migrations/202606180001_supabase_theme_storage.sql:167`; `supabase/migrations/20260623131000_grant_admin_assets_service_read.sql:3`.
  Acceptance criteria: new saves do not create duplicate storage paths for both platforms; signed URL access for enabled canonical admin assets works for non-admin public recommendation consumers; disabled asset paths return 403 for non-admin; both single and batch signed URL endpoints use the same canonical access check; admin still manages assets under RLS.
  QA scenarios: Happy API: POST `/api/theme-assets/signed-urls` and `/api/theme-assets/signed-url` with an enabled canonical asset path returns signed URL, evidence `.omo/evidence/admin-assets-canonical-refactor/task-6-signed-url-happy.txt`. Failure API: POST both routes with disabled/nonexistent admin asset path as non-admin returns 403/400 as appropriate, evidence `.omo/evidence/admin-assets-canonical-refactor/task-6-signed-url-failure.txt`.
  Commit: Y | `fix(theme-assets): authorize canonical admin asset paths`

- [ ] 7. Run full verification and document migration notes
  What to do / Must NOT do: Run all command gates and real-surface QA. Add or keep a reusable QA seed/fixture script only if it is documented and does not expose secrets; otherwise remove temporary seed scripts after evidence is captured. Update `docs/supabase-setup.md` or a short migration note to explain canonical asset management. Do not claim done from green TypeScript alone.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3, 4, 5, 6 | Blocks: final verification
  References: `AGENTS.md:90`; `docs/supabase-setup.md:16`; `docs/ux-flow.md:29`; `.omo/drafts/admin-assets-canonical-refactor.md`.
  Acceptance criteria: `npm run check:text`, `npm run check:ios-slots`, `npm run check:android-colors`, `npx tsc --noEmit`, and `npm run build` exit 0 or pre-existing warnings are explicitly named; admin and editor browser QA artifacts exist; docs mention the canonical asset model at a high level.
  QA scenarios: Happy: run full command gate and save combined transcript `.omo/evidence/admin-assets-canonical-refactor/task-7-command-gate.txt`. Failure/regression: intentionally query invalid recommendation params and disabled asset signed URL route; both fail closed, evidence `.omo/evidence/admin-assets-canonical-refactor/task-7-fail-closed.txt`.
  Commit: Y | `docs(admin-assets): document canonical asset management`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: `git diff --stat` plus checklist against all seven todos; PASS when every Must have has code/evidence and every Must NOT have is untouched; evidence `.omo/evidence/admin-assets-canonical-refactor/f1-plan-compliance.txt`.
- [ ] F2. Code quality review: run `npx tsc --noEmit`, inspect changed TS/TSX pure LOC for files touched, and run no-escape-hatch grep for `as any|@ts-ignore|@ts-expect-error|!\\.`; PASS when clean or pre-existing issues are documented; evidence `.omo/evidence/admin-assets-canonical-refactor/f2-code-quality.txt`.
- [ ] F3. Real manual QA: run QA seed/login, then the admin and editor browser scenarios from Verification strategy; PASS when screenshots/logs exist and expected visible states are present; evidence `.omo/evidence/admin-assets-canonical-refactor/f3-manual-qa.txt`.
- [ ] F4. Scope fidelity: `git diff --name-only` reviewed against Scope OUT; PASS when no unrelated billing/export identity/Payapp/marketplace files changed except docs mentioning asset management; evidence `.omo/evidence/admin-assets-canonical-refactor/f4-scope-fidelity.txt`.

## Commit strategy
- Prefer 4-7 atomic commits matching the todo commit lines only after the user explicitly authorizes committing during implementation.
- Do not commit the pre-existing unrelated `AGENTS.md`/nested AGENTS changes unless the user explicitly wants those included.
- Draft final commit messages:
  - `feat(db): normalize admin asset storage`
  - `refactor(theme): model admin assets as canonical files`
  - `feat(api): serve canonical admin asset recommendations`
  - `refactor(admin): manage asset targets from one upload`
  - `refactor(editor): consume canonical admin recommendations`
  - `fix(theme-assets): authorize canonical admin asset paths`
  - `docs(admin-assets): document canonical asset management`
- If one todo changes only tests/docs or is tiny after implementation, squash into the adjacent logical commit only if the combined commit remains independently verifiable.

## Success criteria
- A common non-bubble admin asset is uploaded once and can target Android+iOS without duplicate Storage objects.
- A bubble admin asset cannot be saved unless Android markers and iOS insets/stretch are complete.
- Recommendation API can filter by platform, asset kind, and slot role server-side.
- `/edit` can still select admin assets and apply bubble adjustments.
- Existing admin assets remain readable after migration/backfill.
- Disabled or nonexistent admin asset storage paths fail closed for non-admin signed URL requests.
- All command gates and browser/API QA scenarios have evidence under `.omo/evidence/admin-assets-canonical-refactor/`.
