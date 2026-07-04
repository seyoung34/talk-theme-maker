# Next.js Migration Notes

## Decisions

- `/` is a start hub for the internal theme making workflow.
- Bubble adjustment now lives inline inside `/edit`.
- The standalone editor route was removed after the inline editor covered the workflow.
- Full folder-based theme preview and export are deferred.

## Completed In This Migration

- Move from Vite entrypoint to Next.js App Router.
- Add TailwindCSS while preserving the existing editor CSS.
- Move 9-patch domain logic to `lib/theme/android`.
- Move shared theme/editor types to `lib/theme`.
- Add placeholder structure for future full-theme preview work.
- Add `/template` flow with template selection, Android/iOS fixed asset slots, image upload, screen previews, and inline bubble adjustment.
- Keep `/project` as a compatibility redirect to `/template`.

## Follow-up TODO

- Chatroom preview from mapped folder resources.
- Friends, tabs, and profile screen previews.
- File content diagnostics for invalid 9-patch borders and iOS CSS image references.
- Diagnostics for missing files, invalid 9-patch borders, and mismatched iOS scale images.
- Separate Android APK and iOS `.ktheme` export pipelines.
