# components/project AGENTS.md

## OVERVIEW

Main `/edit` project editor UI: imports/starts theme projects, edits slot overrides, manages uploads/colors/bubble edits, drives preview and export actions.

## STRUCTURE

```text
components/project/
├── ProjectImporterClient.tsx   # Main client orchestrator for /edit
├── ProjectQuickEditPanel.tsx   # Slot controls and candidate/color editing
├── ProjectPreviewPanel.tsx     # Preview container wiring
├── ProjectGroupRail.tsx        # Group navigation
├── ProjectSectionRail.tsx      # Section navigation
├── projectModel.ts             # UI labels, candidate shaping, re-exports from state
├── exportClient.ts             # Browser export request/download client
├── exportModel.ts              # Export modal/model helpers
├── slotContrast.ts             # Contrast helpers for color slots
└── hooks/                      # Upload, auto-color, export hooks
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Change editor workflow | `ProjectImporterClient.tsx` | Large hotspot; patch narrowly |
| Add slot editing behavior | `ProjectQuickEditPanel.tsx`, `projectModel.ts` | Keep labels/order centralized |
| Change section/group nav | `ProjectSectionRail.tsx`, `ProjectGroupRail.tsx`, `projectModel.ts` | Use `sectionOrder`/`groupLabels` |
| Change export UX | `exportModel.ts`, `exportClient.ts`, `hooks/useProjectExport.ts` | API contracts live outside UI |
| Upload handling | `hooks/useProjectAssetUploads.ts` | Keep admin/template/user upload sources distinct |
| Auto colors | `hooks/useProjectAutoColors.ts`, `lib/theme/autoColor.ts` | Do not bypass project state helpers |

## CONVENTIONS

- UI state should describe the editing surface; persisted/exported theme values belong in `lib/theme/project` shapes.
- Candidate lists should be built through `buildSlotCandidates`, not recreated ad hoc in component branches.
- Keep editor controls dense and stable; this is a repeated-use tool, not a landing page.
- Use existing labels from `projectModel.ts` for sections/groups before adding inline Korean copy.
- Export actions should go through `exportClient.ts` and the route-specific API payloads.
- For large files, prefer small patches or extraction over whole-file rewrites.

## ANTI-PATTERNS

- Do not add preview-only overrides here if export should observe them.
- Do not mix admin asset candidates into user uploads without preserving source metadata.
- Do not couple `/project` legacy flow more tightly; current direction favors `/template` and `/edit`.
