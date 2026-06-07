# KakaoTalk Theme Maker

Browser-only editor for KakaoTalk Android chat bubble `.9.png` assets.

## Goal

Reduce the edit-build-install loop for these files:

- `theme_chatroom_bubble_me_01_image.9.png`
- `theme_chatroom_bubble_you_01_image.9.png`

## Features

- Drag and drop PNG or `.9.png` files.
- Parse Android 9-patch markers.
- Edit `top`, `left`, `right`, and `bottom` marker ranges.
- Preview chat bubbles on a 1080 x 1920 xxhdpi chat screen.
- Show content area and stretch area overlays.
- Detect invalid border pixels that can cause Android `invalid color` build errors.
- Download corrected `.9.png` files.

## Run

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5175
```

Open:

```text
http://127.0.0.1:5175/
```

## Build

```powershell
npm run build
```

## Workflow

1. Select `내 말풍선` or `상대 말풍선`.
2. Drop a PNG or `.9.png`.
3. Adjust marker ranges.
4. Check the 1080 x 1920 chat preview.
5. Download the corrected `.9.png`.
6. Replace the matching file in the KakaoTalk theme project manually.

## Development notes

### Preventing broken Korean text

- This repo now pins text files to `UTF-8` and `LF` through `.editorconfig`, `.gitattributes`, and `.vscode/settings.json`.
- Run `npm run check:text` before or after larger edits. It fails on UTF-8 BOM and replacement characters (`�`).
- If a file is already broken, fix the original text first instead of re-saving the garbled string with a different encoding.

### In-app browser verification

- The recent `node_repl kernel exited unexpectedly` and `windows sandbox failed: spawn setup refresh` messages come from the Codex desktop browser automation layer, not from this Next.js app.
- Treat those failures as tooling/runtime issues. Use `npm run build`, local HTTP checks, or manual browser verification as the fallback verification path when the Browser plugin is unavailable.
