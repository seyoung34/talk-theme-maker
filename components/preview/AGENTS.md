# components/preview AGENTS.md

## OVERVIEW

Preview layer for theme screens. It renders phone-like visual checks for chatroom, main/tabs, more/common assets, and passcode screens from resolved theme project state.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Chatroom fidelity | `ChatroomPreview.tsx` | Bubble rendering, input area, message layout |
| Multi-screen preview | `ThemeScreensPreview.tsx` | Friends/tabs/more/passcode composition |
| Preview shell/framing | `ThemePreviewShell.tsx` | Device-like outer sizing |
| Common asset preview | `CommonAssetsPreview.tsx` | Theme icon/launcher/common resources |
| Passcode preview | `PasscodePreview.tsx` | Passcode colors/images/pattern resources |
| Asset/color resolution helpers | `previewResourceUtils.ts` | Keep shared preview normalization here |

## CONVENTIONS

- Previews should consume already-resolved project/template values from `lib/theme/project/state.ts`.
- Keep dimensions stable; editor panels should not jump when a preview asset loads.
- Match platform behavior only as far as the project model/export mapping can support; document gaps as diagnostics or model-level follow-up notes.
- For 9-patch/ninepatch visuals, use `lib/theme/android/ninepatch.ts` helpers instead of reimplementing border parsing.
- Preview changes should be checked at mobile and desktop widths when they affect layout.

## ANTI-PATTERNS

- Do not hardcode a different fallback asset/color than export uses.
- Do not make preview text or geometry depend on viewport-width font scaling.
- Do not bury instructional copy in the preview surface; keep it focused on visual inspection.
