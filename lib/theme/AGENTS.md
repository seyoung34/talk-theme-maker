# lib/theme AGENTS.md

## OVERVIEW

Core theme domain layer: slot vocabulary, template definitions, project state resolution, platform export logic, and template/admin asset repositories.

## STRUCTURE

```text
lib/theme/
├── types.ts                    # Cross-platform resource roles and shared theme types
├── templates.ts                # Base templates, sections, slots, candidates, export mappings
├── project/                    # Overrides, diagnostics, project export, ZIP utilities
├── android/                    # Android resource/APK/project export and .9.png handling
├── ios/                        # iOS .ktheme export and package validation
├── manifest/                   # Slot metadata checked against samples/export code
├── systemTemplates/            # Operator/system template repository and previews
├── adminAssets.ts              # Admin asset metadata and slot recommendation rules
└── userTemplates.ts            # Browser-local user template persistence
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Add or rename a slot | `templates.ts`, `types.ts`, `manifest/*.json` | Keep role, section, group, candidate, export mapping aligned |
| Resolve current edit value | `project/state.ts` | Shared source for preview and export |
| Validate project export readiness | `project/diagnostics.ts` | Prefer diagnostics before export failure |
| Android package output | `android/export.ts`, `android/apk.ts`, `android/request.ts` | Keep Gradle/sample assumptions local |
| Android nine-patch work | `android/ninepatch.ts` | Used by editor and rendering paths |
| iOS package output | `ios/export.ts`, `ios/packageValidation.ts` | CSS, image refs, scale targets, path validation |
| System templates | `systemTemplates/repository.ts`, `localRepository.ts`, `supabaseRepository.ts` | Use repository interface, not direct storage calls |
| Server asset access | `server/themeAssetAccess.ts`, `remoteAssets.ts` | Signed/public asset resolution boundaries |

## CONVENTIONS

- `ThemeResourceRole` is the stable contract. Add roles deliberately because UI, preview, export, and DB metadata can all depend on it.
- Template defaults remain immutable; user/system edits are overrides.
- `getResolvedAssetUrl`, `getResolvedColor`, `getSelectedUpload`, and related helpers in `project/state.ts` are the normal read path.
- Android and iOS export quirks should not leak into `components/project`; expose shared request/result types instead.
- System templates should stay `baseTemplateId + overrides`; do not persist copied full base template payloads.
- Manifest checks are part of the contract. Update `scripts/verify-ios-slot-metadata.mjs` or `scripts/verify-android-color-slots.mjs` only when the expected contract changes.

## ANTI-PATTERNS

- Do not hardcode one-off slot handling in UI when a slot or export mapping field can carry it.
- Do not make preview resolve assets differently from export.
- Do not let user template state and admin/system template state share persistence helpers.
- Do not accept export paths for iOS that bypass `normalizeIosPath`/package validation.
