---
version: 0.1
name: KakaoTalk Theme Maker
inspiration:
  primary: VoltAgent awesome-design-md / Figma DESIGN.md
  secondary: VoltAgent awesome-design-md / Miro DESIGN.md
purpose: Internal web tool for assembling and previewing Android and iOS KakaoTalk themes.
---

# KakaoTalk Theme Maker Design

## Product Intent

KakaoTalk Theme Maker is not a marketing site. It is an internal production tool for choosing a theme template, replacing required Android/iOS theme assets, checking previews, and moving into advanced bubble editing when precision is needed.

The UI should feel like a design workspace: calm, clear, visual, and task-focused. It can use playful color because the product handles character themes, but the controls must stay stable and readable.

## Reference Choice

Use the Figma-inspired direction as the primary system:

- clean black/white editor frame
- large visual work areas
- soft pastel color blocks for grouped work zones
- confident typography and clear action hierarchy
- minimal shadows, strong spacing, clear selected states

Borrow only a small amount from the Miro-inspired direction:

- board-like asset areas
- sticky-note-like template/slot thumbnails
- bright accent color for the primary workflow action

Do not copy either brand directly. This file translates those references into a local product language for KakaoTalk theme production.

## Visual Theme

The app should look like a practical theme workshop.

- Backgrounds are mostly white or very light neutral.
- Editing zones can use large pale color blocks.
- Preview surfaces should look like real phone/theme surfaces, not decorative cards.
- The user should immediately understand three things: selected template, selected platform, selected editable asset.
- Avoid marketing hero layouts inside the tool.

## Color Tokens

Core:

- `ink`: `#111111` for primary text.
- `muted`: `#5d6670` for secondary text.
- `canvas`: `#ffffff` for page and panel foregrounds.
- `surface`: `#f6f7f5` for quiet tool surfaces.
- `surface-strong`: `#e1e4e0` for structural rails and editor bands.
- `hairline`: `#d7ddd8` for borders and dividers.

Workflow accents:

- `action`: `#c9ff3d` for the main "테마 만들기" action.
- `action-ink`: `#111111` for text on `action`.
- `select`: `#68a0ff` for selected navigation state.
- `focus`: `#452cff` for active asset outline.
- `danger`: `#f45b61` for back/close/destructive emphasis.
- `note-yellow`: `#eeee00` for small guide controls and board notes.
- `note-lime`: `#cddd7d` for asset thumbnails.

Template preview accents may come from the selected template, but controls should keep the above neutral system.

## Typography

Use system Korean-friendly UI fonts:

```css
font-family: "Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
```

Rules:

- Use Korean labels by default.
- Use short labels in controls: `채팅방`, `이미지 업로드`, `고급 말풍선 편집`.
- Use dense but readable editor typography.
- Do not use viewport-scaled font sizes.
- Do not use negative letter spacing in this app.

Suggested scale:

- Page title: `40px`, weight `800-900`.
- Section title: `24px-32px`, weight `800`.
- Control label: `14px-16px`, weight `700-800`.
- Detail text: `12px-14px`, weight `600-700`.
- Preview text: match KakaoTalk-like message sizes, usually `13px-16px`.

## Layout Principles

The main editor uses a three-zone workspace:

- Left rail: screen categories such as `메인 화면`, `채팅 목록`, `채팅방`, `더보기`.
- Center workspace: selected screen slots, asset thumbnails, and quick edit controls.
- Right preview: phone-like theme preview for the currently selected screen.

Rules:

- Keep the preview visible while editing.
- Keep the selected asset visually obvious.
- Use stable dimensions for rails, thumbnails, buttons, and preview frames.
- Allow scrolling inside overflowing regions instead of shrinking important text.
- Do not nest cards inside cards. Use rails, panels, and work zones.
- Use rounded corners intentionally: large structural panels can be rounder; repeated asset thumbnails should stay tighter.

## Component Rules

Buttons:

- Primary workflow action: lime filled pill or rounded button.
- Advanced/technical action: black filled button.
- Back/destructive action: coral/red circular or compact button.
- Secondary action: white or light neutral with border.
- Disabled action: low-contrast neutral, no hover emphasis.

Navigation:

- Active screen tab uses blue fill.
- Inactive tabs use white fill on a gray rail.
- Platform and template are locked once `/edit` starts; show them as read-only metadata, not editable controls.

Asset thumbnails:

- Use a board-like layout with visible selected outline.
- Show whether the asset is template default, uploaded by user, required, or optional.
- Thumbnail surfaces may use pale lime/yellow note colors, but file/path information should remain in neutral detail rows.

Inputs:

- Image upload buttons should be prominent inside the selected slot panel.
- Numeric precision controls for 9-patch or iOS inset should live in the advanced bubble editor unless explicitly promoted into quick edit.

Preview:

- Phone preview should be an actual preview surface, not a decorative card.
- Chat bubbles must respect text content, minimum/maximum width, and stretch/inset behavior.
- Non-chat screens should communicate slot placement even when the exact KakaoTalk UI is not fully implemented yet.

## Route Rules

`/template`:

- Show templates as cards.
- Clicking a template opens a modal preview.
- Modal bottom has separate `Android로 시작` and `iOS로 시작` actions.
- Template cards should emphasize preview imagery, not long explanation.

`/edit`:

- Main production workspace.
- Template and platform are locked.
- User selects screen, then slot, then uploads/replaces an image.
- Bubble slots can hand off to `/editor` for advanced adjustment.
- The right preview follows the active screen.

`/editor`:

- Advanced bubble editor only.
- Android: `.9.png` marker inspection and download.
- iOS: inset/stretch value inspection.
- It may be denser than `/edit`, but it should still keep preview and controls separated.

`/project`:

- Legacy compatibility route only. It should redirect to `/template`.

## Android And iOS Asset Rules

Android:

- Prefer xxhdpi 1080 x 1920 based previews when possible.
- `.9.png` files need visible marker editing and stretch/content preview.
- Asset slot labels must map to official KakaoTalk theme file names.

iOS:

- Show CSS point values and scale-specific pixel values when editing insets.
- `@2x` and `@3x` assets may use different pixel values, but the UI should explain the point conversion.
- CSS `background-image` inset values should be previewable before export.

## Do

- Use Korean UI copy.
- Make the selected item impossible to miss.
- Keep action hierarchy stable across routes.
- Use template assets as the visual personality.
- Use neutral controls so SpongeBob or later character templates can define their own mood.
- Keep dense production information readable.

## Do Not

- Do not turn the internal editor into a marketing landing page.
- Do not use brand-heavy Figma or Miro colors as literal branding.
- Do not allow template/platform switching inside `/edit` after start.
- Do not hide the preview when editing core image slots.
- Do not use decorative gradient blobs or vague abstract backgrounds.
- Do not add export promises before Android APK and iOS ktheme pipelines are implemented.

## Agent Prompt Guide

When modifying UI, follow this prompt:

> Apply `DESIGN.md` as the source of truth. Keep the app as a Korean internal production tool. Use a Figma-like clean editor frame with Miro-like asset-board clarity. Preserve template/platform locking in `/edit`, keep the preview visible, and use neutral controls with lime/blue/focus accents for workflow state.

## Source Notes

This local design guide is adapted from the structure and intent of VoltAgent's `awesome-design-md` collection. The repository describes `DESIGN.md` as a markdown design-system document for agents, and its files include visual theme, color, typography, components, layout, elevation, do/don't rules, responsive behavior, and prompt guidance.
