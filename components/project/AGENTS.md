# components/project

Main `/edit` editor UI. Key files: `ProjectImporterClient.tsx` orchestrates editing, `ProjectQuickEditPanel.tsx` owns slot controls, `ProjectPreviewPanel.tsx` wires previews, `projectModel.ts` centralizes labels/candidate shaping, and `exportClient.ts`/`hooks/useProjectExport.ts` handle export requests.

## Rules

- Persisted/exported theme values belong in `lib/theme/project` shapes, not component-only state.
- Build slot candidates through `buildSlotCandidates`; keep section/group labels in `projectModel.ts`.
- Export actions should go through the existing export client/model/hook boundary.
- Keep the editor dense and stable; this is a repeated-use tool.
- Large files should get narrow patches or small extractions, not whole-file rewrites.

## Avoid

- Preview-only overrides that export cannot observe.
- Mixing admin asset candidates into user uploads without source metadata.
- Re-coupling the legacy `/project` flow; current direction favors `/template` and `/edit`.
