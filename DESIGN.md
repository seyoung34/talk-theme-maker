---
name: Sky Pop
colors:
  surface: '#ffffff'
  surface-dim: '#e8f1ff'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7fbff'
  surface-container: '#eef5ff'
  surface-container-high: '#e3ecf7'
  surface-container-highest: '#dbe8fb'
  on-surface: '#1b1c19'
  # 이전 웜 팔레트에서 남아 있던 '#4b4732'를 같은 명도의 hue 215로 옮긴 값. 흰 면 대비 8.96.
  on-surface-variant: '#444a51'
  inverse-surface: '#1b1c19'
  inverse-on-surface: '#f4f9ff'
  # 코드에서 outline은 테두리가 아니라 11px 안내 문구의 글자색으로 쓴다. 아래 outline-blue('#9bc0f5')는
  # 흰 면 대비 1.87이라 본문에 못 쓰므로, 글자용은 background('#e8f1ff') 기준 4.58을 만족하는 값을 쓴다.
  outline: '#676d76'
  outline-blue: '#9bc0f5'
  outline-variant: '#dbe8fb'
  surface-tint: '#2f6bbf'
  primary: '#fee500'
  on-primary: '#191600'
  primary-container: '#fee500'
  on-primary-container: '#716600'
  inverse-primary: '#ffe93a'
  secondary: '#2f6bbf'
  on-secondary: '#ffffff'
  secondary-container: '#cfe0ff'
  on-secondary-container: '#3d7bd6'
  tertiary: '#ff8fa8'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffe9ef'
  on-tertiary-container: '#ff7aa6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#fee500'
  primary-fixed-dim: '#ffe93a'
  on-primary-fixed: '#191600'
  on-primary-fixed-variant: '#504700'
  secondary-fixed: '#cfe0ff'
  secondary-fixed-dim: '#9bc0f5'
  on-secondary-fixed: '#12294a'
  on-secondary-fixed-variant: '#2f6bbf'
  tertiary-fixed: '#ffe9ef'
  tertiary-fixed-dim: '#ffb3c2'
  on-tertiary-fixed: '#4a0f1e'
  on-tertiary-fixed-variant: '#ff7aa6'
  background: '#e8f1ff'
  on-background: '#1b1c19'
  surface-variant: '#eef5ff'
  accent-gold: '#fbbf24'
  accent-orange: '#fb923c'
  accent-sky: '#5b9bff'
  accent-mint: '#34c98a'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 74px
    fontWeight: '900'
    lineHeight: 1.14
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '900'
    lineHeight: 1.15
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '900'
    lineHeight: 1.2
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '800'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 19px
    fontWeight: '500'
    lineHeight: 32px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 28px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 1.75rem
  xl: 2rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 32px
  stack-sm: 16px
  stack-md: 32px
  stack-lg: 64px
---

## Brand & Style

Sky Pop is the visual language of the TalkTheme landing experience: a friendly, energetic marketing surface that sits above the calmer, precision-focused editor UI. Where the editor is a quiet studio, the landing page is the storefront window — playful, bright, and built to make "내 취향으로 만든 카톡" feel exciting rather than technical.

The aesthetic direction is **Playful Sky, Kakao Pop** — a soft sky-blue wash paired with the unmistakable Kakao yellow as the single loudest accent. Hand-drawn doodle icons (stars, hearts, speech bubbles, sparkles) float loosely around the hero and section edges, hinting at a scrapbook/sticker feel without becoming cluttered. Copy leans on heavy, confident type weights (font-black) for headlines, contrasted with soft pastel tints and fully rounded shapes everywhere else. The overall mood is warm, sincere, and a little fun — closer to a gift shop than a SaaS dashboard.

## Colors

The palette is built around two anchors; per-theme accent colors appear only as the showcase mockup glows.

- **Primary (Kakao Yellow):** `#FEE500`, hover `#FFE93A`. Reserved almost entirely for the primary CTA pill ("내 테마 만들기") and small doodle stars. Text on yellow is near-black (`#191600`) for maximum contrast and brand accuracy.
- **Secondary (Sky Blue):** `#2F6BBF` core / `#3D7BD6` for links and icons (use-case and flow icons are all this blue). Paired with very pale blue surfaces (`#CFE0FF`, `#DBE8FB`, `#E3ECF7`) for borders, pills, and the header background — this is the color that carries the "brand voice" in copy and navigation.
- **Background Wash:** A soft vertical gradient from pale sky (`#E8F1FF`) through white (`#FFFFFF`) and back to sky (`#E9F2FF`) across the whole page, so sections blend into each other with no hard seams or dividers.
- **Showcase Glows:** Only the showcase mockups carry a per-theme color, and only as the blurred glow behind the phone — gold (`rgba(251,191,36,0.30)`) for the character theme, pink (`rgba(255,122,166,0.30)`) for the couple theme, orange (`rgba(251,146,60,0.28)`) for the pet theme. The use-case cards keep their pastel tint + accent pairs (restored on 2026-11-04 after a flat, tint-free version read as bland): gold (`#FFF6D6` / `#F2B705`), sky (`#E3EFFF` / `#5B9BFF`), pink (`#FFE9EF` / `#FF8FA8`), mint (`#EAFAF1` / `#34C98A`) — without emoji.
- **Small text color:** Step numbers and other small secondary labels use `#5B7396` (about 4.8:1 on white), not the paler `#9FB4D0` (about 2:1).
- **Text:** Headlines use a warm near-black (`#1B1C19`) rather than pure black; muted body copy uses a soft warm graphite (`#4B4732`) that keeps long paragraphs calm against the cooler background.
- **Status:** Keep the existing muted error red (`#BA1A1A` / `#FFDAD6`) — success/warning states elsewhere should stay low-saturation so they don't compete with the yellow CTA.

## Typography

Plus Jakarta Sans drives every headline at very heavy weight (font-black / 900), often at large, confident sizes (up to 74px on desktop hero). This is the core signature of the current landing type system — headlines are not just bold, they're maximal, giving the page a punchy, poster-like energy even with soft rounded shapes everywhere else.

The weight hierarchy has three steps: headlines at 900 (font-black), card, step and showcase titles at 700 (font-bold), and body copy at 500 (font-medium). Body used to be 600 like the titles, which flattened the hierarchy. Buttons and badges keep their heavier UI weight. Captions and secondary labels are at least 13px; do not go below that on mobile. Sections do not carry English uppercase eyebrow labels ("Why TalkTheme", "Real Result", "Simple Flow" were removed).

Korean copy should default through Manrope/Plus Jakarta Sans with a Noto Sans KR fallback, and always favor the heaviest available weight for headlines — the design deliberately avoids medium-weight Korean headlines, which read as flat against this palette.

## Layout & Spacing

- **Container:** Centered `max-w-7xl` (landing) with 20px mobile / 32–40px desktop side margins.
- **No hard section dividers:** Sections share one continuous background gradient; separation comes from spacing (`py-16` to `py-28`) and content grouping, not borders or background-color changes.
- **Scattered doodles:** Decorative icons (Star, Heart, MessageCircle, Sparkles) are absolutely positioned at low opacity along section edges, hidden on mobile (`md:block`/`lg:block`) to keep small screens clean.
- **Reveal-on-scroll:** Most section content fades up into place via an IntersectionObserver-driven `.reveal-item` utility (translateY + opacity, staggered by ~90–120ms per card) — motion should always respect `prefers-reduced-motion`.
- **Asymmetric showcase:** Card grids aren't perfectly aligned — the showcase section raises the center card and tilts the others a few degrees (`-4deg`/`0deg`/`4deg`) to feel hand-arranged rather than templated. Order is character → couple → pet (the couple card is the raised center); the hero's rotating keyword starts on the same order, so the first screen shows the character theme.

## Elevation & Depth

Depth comes from colorful blurred glows and drop shadows tinted to match each element's accent color, not gray/neutral shadows.

- **Hero/Showcase glow:** A large, soft `radial-gradient` blur sits behind floating product mockups, tinted to the active subject's accent color (blue, pink, orange) and cross-fades when the subject rotates.
- **Separation rule:** Surfaces are separated by fill and a soft blue-tinted shadow (`rgba(47,107,191,0.06–0.14)`), not by outlines: no hairline borders on cards or panels, and no card inside a card. Landing surfaces: the tinted use-case cards and the white signup-offer panel. Flow steps, showcase figures and the final CTA sit directly on the page wash so the page keeps a rhythm of surface / no surface. Do not remove all surfaces — a version with none read as flat and left sections visually too close together. The `/template` gallery cards use the shadow alone.
- **Buttons:** The primary yellow CTA carries its own colored shadow (`rgba(254,229,0,0.44)`) rather than a neutral drop shadow, reinforcing the brand color even in elevation.
- **Floating motion:** Hero and showcase mockups gently bob (`float-soft`, 8s ease-in-out loop) to feel alive without being distracting.

## Shapes

- **Pills everywhere:** Every button, badge, and nav link is fully rounded (`rounded-full`). This is the single most consistent shape rule on the landing page — square/sharp corners essentially don't appear.
- **Cards:** 20px (mobile) / 28px (desktop) radius for the use-case cards; 28px / 36px for the signup-offer panel; 16px / 28px for the `/template` gallery cards.
- **Borders:** Not on cards or panels. Small controls keep a hairline pale-blue border (`#CFE0FF` / `#DBE8FB`): the carousel buttons, the flow-step icon circles and the signup offer's "가격 보기" pill (restored on 2026-11-04 because the borderless versions looked flat). Do not add borders to new surfaces.

## Components

- **Primary CTA:** Kakao-yellow pill button, near-black text, colored yellow shadow, `-translate-y-0.5` lift + brighter yellow (`#FFE93A`) on hover. Always paired with a trailing arrow icon that nudges right on hover.
- **Secondary CTA:** Two forms. In the hero, "만드는 법 보기" is a borderless text button — blue (`#2F6BBF`) bold text, no fill, a pale-blue (`#EEF4FF`) fill only on hover. In the signup offer, "가격 보기" is a white/translucent pill with a pale blue border and blue text, lifting slightly on hover. Hierarchy comes from the yellow primary pill next to them.
- The hero has no "free first file" note under its buttons; the free-first-file message lives only in the signup-offer section (it depends on the signup bonus campaign, so keep it in one place).
- **Use-Case Card:** Pastel-tinted rounded card (tint per card, see Showcase Glows paragraph in Colors), no border, soft shadow; a white icon chip with an accent-colored icon, a bold (700) title and medium (500) body, in a 2-column (mobile) / 4-column (desktop) grid; hover lifts the card. No emoji.
- **Signup Offer:** White rounded panel with a soft shadow and no border, holding the yellow "가입 혜택" badge, headline, body and the yellow CTA, with the secondary "가격 보기" as a bordered pill. The panel is what separates it from the final CTA below.
- **Carousel buttons:** White/translucent circles with a pale blue border, soft shadow and a blue chevron.
- **Template gallery card (`/template`):** Shadow-only surface, no border; the preview image bleeds to the card's top and side edges (no inner rounded frame, so it is card → preview, not card → frame → preview). The preview image itself has a white backdrop (`#FFFFFF`, set in `lib/theme/systemTemplates/thumbnail.ts`, not gray) with a soft drop shadow under each of the two phone screens so they float on it. Designs compared on 2026-11-04: this shadow-card layout was chosen over a bare tile and over a theme-tinted caption strip; the title row carries a right-aligned arrow icon only (no "템플릿 확인" text, no platform labels — every system template supports Android and iOS). The page opens directly on the gallery (no intro headline or description); when the user has saved templates, "내 템플릿" comes first, otherwise the gallery comes first.
- **Showcase Figure:** Product mockup image with a tilt transform and a colored ambient glow behind it, floating gently, captioned with a plain text title (bold, no pill, no dot, no border) and a short description line.
- **Flow Step:** Numbered (01–04) item with a white icon circle (pale blue `#DBE8FB` border, soft shadow) and blue icon, bold title, and short body copy — kept intentionally simple to contrast with the busier hero/showcase sections.
- **Live word-swap headline:** The hero's rotating keyword (연인/캐릭터/반려동물) uses a highlighter-style yellow underline behind the animated word, reinforcing the "this is personal" message without extra UI chrome.

## Avoid (generic-AI patterns removed in the 2026-11 landing cleanup)

Do not bring these back; they made the page read as template-generated.

- Sparkle/icon pill badges above headlines and pill captions under mockups.
- English uppercase eyebrow labels in a Korean-language page.
- Emoji stacked on top of icon chips inside the same card (the pastel tint itself is fine).
- Repeating the same tagline ("세상에 하나뿐인") in many places; keep it to a few deliberate spots (opening overlay, final CTA headline) and prefer concrete copy elsewhere.
- Decorative infinite motion beyond the hero keyword swap and the floating mockups, and any motion that ignores `prefers-reduced-motion`.
- Bordered cards and cards inside cards (for example a gray preview frame inside a white card inside a shadowed card). Stacked outlines and nested layers read as cluttered, on both the landing page and `/template`. Small controls with a hairline border are fine; so are surfaces — this is about nesting and card outlines.
