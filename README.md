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
