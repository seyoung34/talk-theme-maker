# PROJECT AGENTS

`kakaotalk-theme-maker` is a Next.js App Router + Tailwind editor for creating KakaoTalk Android/iOS themes from templates. Current product flow: `/template` starts work and `/edit` is the main project editor, including inline bubble/nine-patch adjustment.

## Key Paths

- `lib/theme/`: canonical theme model, templates, project state, preview/export resolution, Android/iOS packaging.
- `components/project/`: main `/edit` editor UI and export workflow.
- `components/preview/`: phone-like previews. Preview must resolve assets/colors through the same project state as export.
- `app/api/`: route handlers for export, billing/credits, auth/session, and signed theme assets.
- `supabase/migrations/`: forward-only DB migrations.
- `public/template-assets/`, `android-sample-theme/`, `samples/ios/`: source/reference assets for packaging.

## Core Rules

- Treat templates as `baseTemplateId + overrides`; do not mutate defaults or copy whole base templates for system templates.
- `ThemeResourceRole`, slot definitions, selected candidates, uploads, colors, and bubble edits are shared contracts. UI-only state is wrong when export needs the value.
- Shared project reads belong in `lib/theme/project`; platform quirks belong in `lib/theme/android` or `lib/theme/ios`; API routes should delegate domain and billing work to `lib`.
- Preserve admin/system template persistence separately from user-local template persistence.
- Keep focused changes focused. Avoid broad reformatting and large TSX rewrites unless the task requires it.

## Git Branching and Release

- Treat `main` as the service and deployment branch. Do not develop new application code, tests, migrations, or configuration changes directly on `main`.
- Start every change from an up-to-date `main` in a descriptive `feature/*`, `fix/*`, or `chore/*` branch. Confirm the current branch before editing, committing, merging, or pushing.
- Keep commits focused, include relevant tests with behavior changes, and run the smallest useful verification set before requesting review or merging.
- Merge work back into `main` only after review and CI (or the repository's documented equivalent) pass. Do not push unreviewed work directly to `main`.
- Direct commits to `main` are reserved for explicitly approved release or maintenance actions. Urgent hotfixes should still be developed on a branch and merged promptly.
- Never force-update or delete `main`.

### Production deployment

- The normal production path is `work/N` (or a named task branch) → PR → required `verify` →
  `main` merge → Cloudflare Workers Builds. Do not run a production deploy from an Orca lane,
  local shell, or the local `main` worktree.
- Configure the Cloudflare Workers Builds production trigger to listen only to `main`, use
  `npm run cf:build:workers` as its build command, and use `npm run cf:deploy:production` as
  its production deploy command. `cf:build:workers` supports non-main preview builds but only
  allows production values when the branch is `main`; do not enable a second production deploy
  path in GitHub Actions or the dashboard.
- `npm run cf:build` is the local Cloudflare build/preview command. The `:production` build and
  deploy scripts intentionally fail unless Cloudflare Workers Builds provides `WORKERS_CI=1` and
  `WORKERS_CI_BRANCH=main`. These checks reduce mistakes but are not a security boundary; local
  production deploy credentials must be removed through Cloudflare IAM.
- Local validation may use `wrangler dev`, `wrangler types`, `npm run cf:build`, and
  `wrangler deploy --dry-run`. Local validation must not use `wrangler deploy`,
  `wrangler versions deploy`, `wrangler rollback`, or production Secret mutation commands.
- `NEXT_PUBLIC_*` values are build-time inputs and must be configured in the production Workers
  Builds trigger. Non-secret Worker variables stay in `wrangler.jsonc`; tokens and credentials
  stay in Cloudflare Worker Secrets. Do not use `--keep-vars` as a blanket fix for configuration
  drift.
- A manual production deploy is break-glass only: explicit user approval, clean `main` checkout,
  fresh production build, `--dry-run`, health check, version/rollback record, and short-lived
  credential removal are mandatory. Production deployment, IAM changes, and Secret changes remain
  approval-gated.

## System Theme Asset Production

- Visual planning, generation runs, prompts, provenance, and asset-level QA now live in the standalone `E:\TalkTheme-Factory` repository. Do not start or store factory runs in this application repository.
- Consume only explicitly approved clean assets from `E:\TalkTheme-자료\시스템 템플릿`.
- Keep Factory manifests and application role/slot mappings as a versioned handoff. Do not infer Android/iOS slots from factory filenames.
- The external Factory must not write `/admin/*`, Supabase, template overrides, exports, publication state, billing, or credits. The operator assembles and publishes system templates manually here.
- Generated review boards prove candidate consistency only. Android/iOS preview and export remain the final product checks.

## Windows And Encoding

- Source files stay UTF-8. Korean UI text is expected.
- Prefer `apply_patch` for manual edits.
- Do not rewrite `.ts`, `.tsx`, `.md`, `.json`, or `.css` with PowerShell `Set-Content`, `Out-File`, `>`, `>>`, or `echo`.
- Do not treat terminal mojibake as file corruption; re-read with UTF-8 before changing text.

## Verification Budget

Choose the smallest useful check set for the files changed; do not run the full suite by default.
CI (`.github/workflows/ci.yml`) runs the full set on every PR, so local runs stay scoped to what you touched.

- Docs, comments, or AGENTS-only changes: no build required.
- Korean UI text changes: re-read touched lines as UTF-8 and run `npm run check:text`.
- Slot metadata or iOS export mapping changes: `npm run check:ios-slots`.
- Android color slot/export mapping changes: `npm run check:android-colors`.
- Android sample asset/removal-list changes: `npm run check:android-assets`. The removal list lives in `removeBundledOptionalDrawables()` in `lib/theme/android/buildCore.ts`; the script parses it by name, so moving or renaming that function breaks the check.
- iOS package validation or ZIP writer changes: `npm run check:ios-export`.
- `adminAssetDomain.ts` / `adminAssets.ts` contract changes: `npm run check:admin-asset-domain`.
- New or changed `supabase/migrations/*.sql`: `npx supabase db reset` against the local stack. See "Local Database".
- TypeScript logic/API changes: `npx tsc --noEmit`.
- Production deployment guard changes: `npm test -- scripts/verify-workers-context.test.ts`,
  plus the local negative checks for `npm run cf:build:workers`,
  `npm run cf:build:production`, and
  `npm run cf:deploy:production`. Do not execute a real production deploy during local validation.
- Changes to `lib/theme` pure functions or other unit-tested logic: `npm test` (Vitest). Add/extend a `*.test.ts` beside the changed module when practical.
- Code quality / catching unused vars and hook-deps issues: `npm run lint` (ESLint flat config; `next/core-web-vitals` + `next/typescript`). CI gates on `--max-warnings 42`, the count when CI was introduced: `error` must stay 0 and warnings must not grow. Lower the baseline in `ci.yml` as warnings get cleaned up; never raise it.
- Broad route/config/export packaging changes or release confidence pass: `npm run build`.
- Editor bootstrap/autosave, `/account` export history, or cross-page navigation changes: `npm run test:e2e` (Playwright). It runs a fresh `next build` with Supabase disabled, so it takes a few minutes and overwrites `.next` — run it only when a change crosses component/API/browser-storage boundaries, and re-run `npm run build` before `npm run start`. See `e2e/AGENTS.md`.

Useful commands:

```powershell
npm run dev -- --host 127.0.0.1
npm run check:text
npm run check:ios-slots
npm run check:android-colors
npm run check:all      # all 7 contract checks, same set CI runs
npx tsc --noEmit
npm test
npm run lint
npm run build
npm run test:e2e
```

## Local Database

Migrations are verified against a local Supabase stack, never by pushing to the linked project first.

```powershell
npx supabase start     # needs Docker Desktop running
npx supabase db reset  # replays every migration from an empty database
npx supabase stop
```

`db reset` replays the whole `supabase/migrations/` chain from scratch; `db push` only sends what is
not yet applied, so it cannot tell you a migration is broken from a clean slate. Run `db reset` for any
migration change before `npx supabase db push` sends it to the linked project.

- Local endpoints: API `127.0.0.1:54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`.
- To point the app at it, swap `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  `SUPABASE_SECRET_KEY` in `.env.local` for the `supabase start` output. Back up the production values first.
- `supabase/config.toml` is committed; `major_version` must match the linked project's Postgres major.
- Local data starts empty. `/admin/*` needs an account whose `user_id` is in `admin_profiles`.

New tables must grant `service_role` explicitly. It inherits only `REFERENCES`, `TRIGGER` and
`TRUNCATE` here, so anything reached through `createAdminClient()` fails with `42501 permission denied`
at the table grant — before RLS is consulted. Verify RLS by querying PostgREST directly rather than
through the UI, so "the screen hides it" is not mistaken for "the database blocks it".

Testing/lint setup: Vitest (`vitest.config.ts`, happy-dom env, `@/` alias, setup in `vitest.setup.ts`) with `@testing-library/react`; Playwright (`playwright.config.ts`, specs in `e2e/`, `e2e/**` excluded from Vitest); ESLint 9 flat config (`eslint.config.mjs`). `scripts/**` are Node-only and excluded from lint. All are devDependencies (no bundle/edge impact).

Next 15 uses `./.next/types/routes.d.ts` for generated route types in this project; keep `next-env.d.ts` on that path.

`npm run build` may show existing Turbopack/NFT warnings around the Android sample project. Treat warnings as pre-existing unless the current change clearly introduced them.

## Agent Control Layer (MVP)

- `docs/control/STATUS.md` is a local-only operational snapshot. The `docs/` directory is intentionally ignored by Git; never force-add this file to the application repository. It is a convenience for the coordinator/operator, not the source of truth for code review or deployment state.
- Update `STATUS.md` only at meaningful checkpoints: when a Normal-or-larger task starts, when it completes, when it is blocked, or when a user Decision Gate is needed. Simple tasks do not require a status update.
- Keep the existing `docs/plans/` structure as the detailed plan queue. Do not create an Initiative, Decision database, or Review file for every task. Add those only when repeated work shows a real need.
- Use Orca messages for cross-agent handoff and review instead of copying full conversations or creating a per-task artifact by default. A handoff should contain only:

  ```text
  Task
  Goal
  Scope
  Changed
  Validation
  Risks / Open Questions
  Review Request
  ```

- A review response should state `Verdict` (`approve`, `changes_requested`, or `blocked`), list findings by severity, report validation performed, and identify any user Decision Gate. The reviewer reads the task, relevant scoped `AGENTS.md`, current code, Git diff, and handoff; it should not reread the full prior conversation.
- Default routing is adaptive: Simple = one agent; Normal = Builder then Reviewer; Complex = Coordinator with explicit Orca tasks and a reviewer; Strategy = Product/Growth analysis plus technical feasibility review when useful. Claude and Codex are not assigned permanent Builder/Reviewer identities.
- Use one writer per worktree and run review sequentially after the writer's changes are stable. Use separate worktrees when multiple agents must write concurrently.
- Agents may prepare branches, commits, PRs, and scoped verification. Explicit user approval is required before production deployment, data deletion, irreversible database migrations, high-cost actions, or security-risk changes. A passing CI check is not product approval.
- The Coordinator should surface only unresolved product/UX/behavior changes and the approval boundaries above. Technical disagreements should receive one evidence-based peer review attempt before becoming a user Decision Gate.
