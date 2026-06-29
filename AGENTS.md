# AGENTS.md

## Project Context

This repository is `kakaotalk-theme-maker`, a Next.js 16 + App Router + Tailwind CSS tool for editing and exporting KakaoTalk themes.

Current product direction:

- Treat the app as a theme project editor, not only a chat bubble image utility.
- Keep `/edit` as the main editing workflow.
- Keep preview and export behavior aligned through shared theme/project state.
- Support Android and iOS export accuracy for KakaoTalk theme packages.
- Prefer template-first workflows centered on `/template`.
- Treat `basic` as the base template. Operator-created concept themes are system templates built from base template plus overrides.
- Build the MVP on IndexedDB, but keep repository/data boundaries ready for a later server DB, payments, credits, and public template marketplace.

Important existing references:

- `README.md`: basic run/build notes and encoding notes.
- `docs/theme-architecture.md`: data model and folder direction.
- `docs/roadmap.md`: broader product roadmap.
- `docs/ux-flow.md`: user flow notes.
- `docs/migration-plan.md`: migration notes.
- `samples/ios/apeach-25.8.0`: iOS sample theme reference.
- `android-sample-theme`: Android sample theme reference.

## Development Rules

- Read the existing code before changing behavior.
- Keep changes scoped to the requested feature or fix.
- Follow existing folder boundaries under `app`, `components`, `lib`, `public`, `samples`, and `scripts`.
- Prefer shared theme/project model changes over ad hoc UI-only state when preview and export both need the same value.
- Do not rewrite unrelated files or reformat broad areas during a focused change.
- Do not revert user changes unless explicitly asked.
- Use `apply_patch` for manual source edits.
- Avoid PowerShell redirection or `echo` for writing source files.
- Keep comments rare and useful.

## Windows And Encoding Rules

This project contains Korean UI text and runs on Windows. Treat text encoding as a first-class concern.

- Source files should be UTF-8.
- When reading text files in PowerShell, use `Get-Content -Encoding UTF8`.
- Prefer `apply_patch` for source edits.
- Do not rewrite source files with PowerShell `Set-Content`, `Out-File`, shell redirection (`>`, `>>`), or `echo`, especially for `.ts`, `.tsx`, `.md`, `.json`, and `.css`.
- When writing through PowerShell is genuinely unavoidable, get explicit approval in the task context and use explicit UTF-8 no-BOM options.
- For large TSX files, do not rewrite the whole file. Use small `apply_patch` hunks or extract new files and import them.
- Do not assume terminal mojibake means the file itself is corrupted.
- If Korean output looks broken, separate terminal output encoding from actual file contents.
- After editing files with Korean text, re-read important files with `Get-Content -Encoding UTF8`.
- Do not preserve or re-save garbled Korean strings. Fix the original intended text instead.
- `npm run check:text` catches UTF-8 BOM, replacement characters, and common mojibake fragments. It may still miss new valid-Unicode mojibake patterns.
- If mojibake appears, do not repeat the same command. First decide whether the problem is terminal output encoding or actual file content.
- When Korean UI text is touched, inspect the edited lines with `Get-Content -Encoding UTF8` and search for known mojibake fragments before finishing.
- Prefer improving `scripts/check-text-encoding.mjs` when a new recurring mojibake pattern is found.
- After `npm run build`, check `next-env.d.ts`. If Next changed the import to `./.next/types/routes.d.ts`, restore the local dev import `./.next/dev/types/routes.d.ts` before finishing.

Useful PowerShell setup when encoding output is suspicious:

```powershell
chcp 65001 > $null
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
```

## Commands

Install:

```powershell
npm install
```

Dev server:

```powershell
npm run dev -- --host 127.0.0.1
```

Text encoding check:

```powershell
npm run check:text
```

TypeScript check:

```powershell
npx tsc --noEmit
```

Production build:

```powershell
npm run build
```

Recommended verification after implementation:

```powershell
npm run check:text
npx tsc --noEmit
npm run build
```

Known note:

- `npm run build` may show existing Turbopack/NFT warnings. Treat them as pre-existing unless a change clearly introduces a new error.

## Git Workflow

- Check `git status --short` before edits when the task involves code changes.
- Keep commits feature-sized.
- If the user asks for commit, run verification first when practical.
- Do not stage unrelated user changes.
- Mention commit hash in the final response when a commit is created.

## Current Known State

Recent project state from prior work:

- `/edit` header is organized into left title, center status, and right actions.
- `/edit` supports saving user templates and admin/system templates through IndexedDB-backed repositories.
- `/template` shows base templates, user templates, and system templates. Template start state is handed off through `templateStartStorageKey`.
- `/admin`, `/admin/assets`, and `/admin/edit` exist for local MVP administration.
- Admin assets are exposed as image candidates for compatible slots.
- Android resource/project/APK export works through the unified export modal.
- Preview uses a taller phone-like ratio around `1080 / 2340`.
- Android export supports `applicationId`, `namespace`, Manifest `package`, `versionName`, and computed `versionCode`.
- iOS export aligns more closely with sample scale assets, including `@2x` and `@3x` generation for bubble and other scale-aware assets.
- Some files have had Korean mojibake issues in the past, so verify Korean text carefully.

Open work likely to appear again:

- Move IndexedDB repositories to a server-backed implementation when deployment and monetization begin.
- Separate free/base templates, operator system templates, paid templates, and user-owned templates clearly in data contracts.
- Continue reducing `/project` in favor of `/template` and `/edit` flow.
- Improve mojibake detection in `scripts/check-text-encoding.mjs`.
- Continue filling iOS slot/export coverage to match the Android core editing scope.

## Architecture Preferences

- Theme definitions should move toward manifest-like data rather than large hardcoded logic.
- Slots should have stable roles and candidates.
- User edits should be stored as overrides rather than mutating template defaults.
- System templates should also be stored as `baseTemplateId + overrides`, not as copied full templates.
- Base templates and system templates are different concepts: base templates are product defaults; system templates are operator-created distributable themes.
- Preview and export should resolve from the same state.
- Diagnostics should run before export where practical.
- Android and iOS platform differences should live under `lib/theme/android` and `lib/theme/ios`.
- Shared project state helpers belong under `lib/theme/project`.
- User template persistence belongs under `lib/theme/userTemplates`.
- System template persistence should go through the `SystemTemplateRepository` interface so IndexedDB can later be swapped for a server DB.
- Admin asset persistence should remain isolated from user template state, even while both use IndexedDB for the MVP.

## Export Identity Rules

- Android theme identity is controlled by Gradle `applicationId`; update `namespace` and Manifest `package` with it for sample consistency.
- Android same-theme updates should keep `applicationId` stable and increase `versionName` so computed `versionCode` increases.
- Android different themes should use different `applicationId` values.
- iOS theme identity is controlled by `-kakaotalk-theme-id` in `KakaoTalkTheme.css`.
- Export file names should follow the export modal name and version when possible.

## UI Preferences

- Keep editor UI dense, practical, and focused on repeated use.
- Avoid landing-page style composition for the editor surface.
- Use clear controls, stable dimensions, and compact labels.
- Do not add explanatory text inside the app unless it helps the actual workflow.
- Keep mobile/desktop responsive behavior in mind when editing preview or side panels.

## How To Ask Codex Efficiently For This Repo

Prefer concise requests like:

```text
In kakaotalk-theme-maker, implement user template saving with IndexedDB.
Use AGENTS.md rules.
Verify with check:text, tsc, and build.
Commit when done.
```

Avoid pasting long repeated context that already exists in this file.
