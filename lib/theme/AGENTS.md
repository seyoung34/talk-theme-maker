# lib/theme

Core theme domain layer: slot vocabulary, templates, project state resolution, diagnostics, platform exports, and template/admin asset repositories.

## Key Files

- `types.ts`, `templates.ts`, `manifest/`: resource roles, slots, candidates, metadata, export mapping.
- `SLOT_EXPORT_KEYS.md`: generated table of every slot and the key it actually writes — the Android
  `colors.xml` entry or drawable path, the iOS CSS block and property. Regenerate with
  `npm run docs:slot-keys`; never edit it by hand.
- `project/state.ts`, `project/diagnostics.ts`, `project/export.ts`: shared project resolution and export readiness.
- `android/`, `ios/`: platform-specific packaging and validation.
- `systemTemplates/`, `adminAssets.ts`, `userTemplates.ts`: separate template/asset persistence paths.

## Rules

- `ThemeResourceRole` is the stable contract across UI, preview, export, and DB metadata. Add or rename roles deliberately.
- Template defaults are immutable; user/system edits are overrides.
- Use `getResolvedAssetUrl`, `getResolvedColor`, `getSelectedUpload`, and related project-state helpers as the normal read path.
- Keep Android/iOS export quirks out of `components/project`; expose shared request/result types instead.
- Manifest checks are contract checks. Update verification scripts only when the contract intentionally changes.

## Relevant Checks

- Any `manifest/*.slots.json` change: `npm run check:slot-keys` (fails if `SLOT_EXPORT_KEYS.md` is stale).
- Slot or iOS mapping changes: `npm run check:ios-slots`.
- Android color mapping changes: `npm run check:android-colors`.
- Shared TypeScript contract changes: `npx tsc --noEmit`.
