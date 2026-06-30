# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-30
**Commit:** 11f15af
**Branch:** main

## OVERVIEW

`kakaotalk-theme-maker` is a Next.js 16 App Router + Tailwind CSS editor for building KakaoTalk Android/iOS themes from templates, previewing them, and exporting platform packages.

Product direction: `/template` starts work, `/edit` is the main project editor, `/editor` is the precision bubble/nine-patch tool. Preview and export must resolve from the same theme project state.

## STRUCTURE

```text
kakaotalk-theme-maker/
├── app/                         # App Router pages and API route handlers
├── components/project/          # Main /edit project editor surface
├── components/preview/          # Phone-like theme previews used by editor/gallery
├── components/admin/            # Local admin UI for assets/templates/promotions
├── components/template/         # /template gallery and template handoff
├── lib/theme/                   # Slot model, project state, templates, exports
├── lib/billing/                 # Credits, Payapp, export job accounting helpers
├── lib/supabase/                # Supabase clients/config/auth helpers
├── public/template-assets/      # Base template assets
├── android-sample-theme/        # Android export source/reference project
├── samples/ios/                 # iOS .ktheme reference sample
├── scripts/                     # Encoding and slot/export validation checks
└── supabase/migrations/         # Auth, billing, asset, export, template schema
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Template/slot model | `lib/theme/templates.ts`, `lib/theme/types.ts` | Stable roles, candidates, export mappings |
| Project edit state | `lib/theme/project/`, `components/project/` | Overrides, uploads, selected candidates, diagnostics |
| Preview fidelity | `components/preview/`, `lib/theme/project/state.ts` | Preview must use resolved project state |
| Android export | `lib/theme/android/`, `app/api/export/android*` | Sample project and Gradle tracing are required |
| iOS export | `lib/theme/ios/`, `app/api/export/ios/route.ts` | `KakaoTalkTheme.css`, `Images/`, scale assets |
| User/system templates | `lib/theme/userTemplates.ts`, `lib/theme/systemTemplates/` | User local storage vs operator system templates |
| Admin assets | `components/admin/`, `lib/theme/adminAssets.ts`, `app/api/theme-assets/` | Asset recommendations and signed URLs |
| Credits/billing | `lib/billing/`, `app/api/billing/`, `app/api/credits/` | Export credit reservation and Payapp flow |
| DB changes | `supabase/migrations/` | Keep SQL migrations forward-only |

## CODE MAP

LSP/codegraph were unavailable in this session; map is from static file/export/import analysis.

| Symbol/File | Type | Location | Role |
| --- | --- | --- | --- |
| `ThemeResourceRole` | type | `lib/theme/types.ts` | Canonical resource vocabulary across preview/export |
| `ThemeAssetSlot` | type | `lib/theme/templates.ts` | Slot definition with candidates and platform mapping |
| `getResolvedAssetUrl` / `getResolvedColor` | functions | `lib/theme/project/state.ts` | Shared resolution path for preview/export |
| `ProjectImporterClient` | component | `components/project/ProjectImporterClient.tsx` | Main `/edit` orchestration surface |
| `ProjectQuickEditPanel` | component | `components/project/ProjectQuickEditPanel.tsx` | Slot editing controls |
| `ThemeScreensPreview` / `ChatroomPreview` | components | `components/preview/` | Multi-screen and chatroom visual fidelity |
| `exportThemeProject` | function | `lib/theme/project/export.ts` | Project export assembly |
| Android export routes | route handlers | `app/api/export/android*` | Android ZIP/APK/project export surface |
| iOS export route | route handler | `app/api/export/ios/route.ts` | `.ktheme` export surface |
| `reserveCreditForExport` | function | `lib/billing/credits.ts` | Credit reservation before paid/server exports |

## CONVENTIONS

- Treat templates as base template + overrides. Do not mutate template defaults for user edits.
- Keep `basic` as the base template; system templates are operator-created themes layered on base templates.
- Preview and export must read the same slot roles, candidate selections, uploads, colors, and bubble edits.
- Platform differences belong under `lib/theme/android` and `lib/theme/ios`; shared state belongs under `lib/theme/project`.
- Admin asset persistence is separate from user template persistence even while both use IndexedDB/Supabase-backed MVP paths.
- API route handlers should keep request parsing/HTTP concerns local and delegate theme/billing logic to `lib`.

## ANTI-PATTERNS

- Do not add UI-only state when export needs the same value.
- Do not copy full templates to create system templates; store `baseTemplateId + overrides`.
- Do not broaden reformatting or rewrite large TSX files for focused changes.
- Do not trust terminal mojibake as file corruption; verify file bytes/content with UTF-8 reads.
- Do not weaken encoding or slot verification scripts to pass a broken change.

## WINDOWS AND ENCODING

This repo contains Korean UI text and is commonly edited on Windows.

- Source files should stay UTF-8.
- Prefer `apply_patch` for manual edits.
- Do not rewrite `.ts`, `.tsx`, `.md`, `.json`, or `.css` with PowerShell `Set-Content`, `Out-File`, `>`, `>>`, or `echo`.
- If Korean UI text is touched, re-read the edited lines with UTF-8 and run `npm run check:text`.
- After `npm run build`, check `next-env.d.ts`; if Next changed the import to `./.next/types/routes.d.ts`, restore the local dev import `./.next/dev/types/routes.d.ts`.

## COMMANDS

```powershell
npm install
npm run dev -- --host 127.0.0.1
npm run check:text
npm run check:ios-slots
npm run check:android-colors
npx tsc --noEmit
npm run build
```

Recommended verification for implementation work:

```powershell
npm run check:text
npm run check:ios-slots
npm run check:android-colors
npx tsc --noEmit
npm run build
```

## NOTES

- `npm run build` may show existing Turbopack/NFT warnings around the Android sample project; treat warnings as pre-existing unless a change clearly introduces a new error.
- `README.md` still describes the older browser-only bubble utility surface; prefer `docs/theme-architecture.md`, `docs/roadmap.md`, and these AGENTS files for current architecture.
- Current scale: about 169 tracked source/doc/migration files excluding generated folders, with about 20k TS/JS lines. Large-file hotspots are `components/project/ProjectImporterClient.tsx`, `components/editor/BubbleEditorClient.tsx`, `components/admin/AdminAssetsClient.tsx`, `components/template/TemplateGalleryClient.tsx`, and preview components.
