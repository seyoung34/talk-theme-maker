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
- TypeScript logic/API changes: `npx tsc --noEmit`.
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

Testing/lint setup: Vitest (`vitest.config.ts`, happy-dom env, `@/` alias, setup in `vitest.setup.ts`) with `@testing-library/react`; Playwright (`playwright.config.ts`, specs in `e2e/`, `e2e/**` excluded from Vitest); ESLint 9 flat config (`eslint.config.mjs`). `scripts/**` are Node-only and excluded from lint. All are devDependencies (no bundle/edge impact).

Next 15 uses `./.next/types/routes.d.ts` for generated route types in this project; keep `next-env.d.ts` on that path.

`npm run build` may show existing Turbopack/NFT warnings around the Android sample project. Treat warnings as pre-existing unless the current change clearly introduced them.
