# components/preview

Phone-like theme previews for chatroom, tabs/main, more/common assets, and passcode screens.

## Rules

- Consume resolved project/template values from `lib/theme/project/state.ts`; do not invent fallback assets or colors here.
- Keep preview dimensions stable so editor panels do not jump when assets load.
- Use `previewResourceUtils.ts` for shared preview normalization and `lib/theme/android/ninepatch.ts` for nine-patch visuals.
- Check mobile and desktop widths when a preview layout change could affect responsive behavior.

## Avoid

- Viewport-width font scaling.
- Instructional copy inside preview surfaces.
- Platform behavior that is not represented in the model/export mapping; document unsupported gaps instead.
