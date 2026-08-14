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
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 28px
  label-eyebrow:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: '900'
    lineHeight: 16px
    letterSpacing: 0.2em
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

The palette is built around two anchors and a rotating set of pastel accents used per use-case or showcase card.

- **Primary (Kakao Yellow):** `#FEE500`, hover `#FFE93A`. Reserved almost entirely for the primary CTA pill ("내 테마 만들기") and small doodle stars. Text on yellow is near-black (`#191600`) for maximum contrast and brand accuracy.
- **Secondary (Sky Blue):** `#2F6BBF` core / `#3D7BD6` for links, badges, and eyebrow labels. Paired with very pale blue surfaces (`#CFE0FF`, `#DBE8FB`, `#E3ECF7`) for borders, pills, and the header background — this is the color that carries the "brand voice" in copy and navigation.
- **Background Wash:** A soft vertical gradient from pale sky (`#E8F1FF`) through white (`#FFFFFF`) and back to sky (`#E9F2FF`) across the whole page, so sections blend into each other with no hard seams or dividers.
- **Pastel Accent Set:** Each use-case/showcase card gets its own tint + accent pair rather than one fixed tertiary color — gold (`#FBBF24` / `#FFF6D6`), sky (`#5B9BFF` / `#E3EFFF`), pink (`#FF8FA8` / `#FFE9EF`, `#FF7AA6` for the couple theme), mint (`#34C98A` / `#EAFAF1`), and orange (`#FB923C`). These rotate to keep the grid visually varied while staying inside a consistent pastel family.
- **Text:** Headlines use a warm near-black (`#1B1C19`) rather than pure black; muted body copy uses a soft warm graphite (`#4B4732`) that keeps long paragraphs calm against the cooler background.
- **Status:** Keep the existing muted error red (`#BA1A1A` / `#FFDAD6`) — success/warning states elsewhere should stay low-saturation so they don't compete with the yellow CTA.

## Typography

Plus Jakarta Sans drives every headline at very heavy weight (font-black / 900), often at large, confident sizes (up to 74px on desktop hero). This is the core signature of the current landing type system — headlines are not just bold, they're maximal, giving the page a punchy, poster-like energy even with soft rounded shapes everywhere else.

Manrope handles body copy and UI labels at semi-bold/bold weight (600–700) rather than regular, so paragraphs still feel sturdy next to the heavy headlines. Section eyebrows ("Why TalkTheme", "Real Result", "Simple Flow") use small, uppercase, widely-tracked (0.2em) Manrope labels in the secondary blue to mark each section without adding visual weight.

Korean copy should default through Manrope/Plus Jakarta Sans with a Noto Sans KR fallback, and always favor the heaviest available weight for headlines — the design deliberately avoids medium-weight Korean headlines, which read as flat against this palette.

## Layout & Spacing

- **Container:** Centered `max-w-7xl` (landing) with 20px mobile / 32–40px desktop side margins.
- **No hard section dividers:** Sections share one continuous background gradient; separation comes from spacing (`py-16` to `py-28`) and content grouping, not borders or background-color changes.
- **Scattered doodles:** Decorative icons (Star, Heart, MessageCircle, Sparkles) are absolutely positioned at low opacity along section edges, hidden on mobile (`md:block`/`lg:block`) to keep small screens clean.
- **Reveal-on-scroll:** Most section content fades up into place via an IntersectionObserver-driven `.reveal-item` utility (translateY + opacity, staggered by ~90–120ms per card) — motion should always respect `prefers-reduced-motion`.
- **Asymmetric showcase:** Card grids aren't perfectly aligned — the showcase section raises the center card and tilts the others a few degrees (`-4deg`/`0deg`/`4deg`) to feel hand-arranged rather than templated.

## Elevation & Depth

Depth comes from colorful blurred glows and drop shadows tinted to match each element's accent color, not gray/neutral shadows.

- **Hero/Showcase glow:** A large, soft `radial-gradient` blur sits behind floating product mockups, tinted to the active subject's accent color (blue, pink, orange) and cross-fades when the subject rotates.
- **Cards (Use Cases, Flow):** White surfaces, no or very light borders, soft shadow tinted toward the blue brand color (`rgba(47,107,191,0.06–0.14)`), deepening and lifting (`-translate-y-1` to `-translate-y-1.5`) on hover.
- **Buttons:** The primary yellow CTA carries its own colored shadow (`rgba(254,229,0,0.44)`) rather than a neutral drop shadow, reinforcing the brand color even in elevation.
- **Floating motion:** Hero and showcase mockups gently bob (`float-soft`, 8s ease-in-out loop) to feel alive without being distracting.

## Shapes

- **Pills everywhere:** Every button, badge, and nav link is fully rounded (`rounded-full`). This is the single most consistent shape rule on the landing page — square/sharp corners essentially don't appear.
- **Cards:** 24–28px radius for use-case tiles, showcase captions, and flow-step cards.
- **Borders:** When present, thin (1px) and pale blue (`#CFE0FF`/`#DBE8FB`/`#E3ECF7`), used to "outline" white or translucent surfaces rather than to separate colors.

## Components

- **Primary CTA:** Kakao-yellow pill button, near-black text, colored yellow shadow, `-translate-y-0.5` lift + brighter yellow (`#FFE93A`) on hover. Always paired with a trailing arrow icon that nudges right on hover.
- **Secondary CTA:** White/translucent pill with a pale blue border and blue text — used for lower-emphasis actions like "만드는 법 보기".
- **Eyebrow Badge:** Small rounded pill with a pale blue border, translucent white fill, blue text, and a small icon (Sparkles/Star) — used above every major headline to label the section.
- **Use-Case Card:** White rounded card with an emoji in the top-right corner and a colored icon chip (tinted background + matching icon color) drawn from the pastel accent set; hover lifts the card and scales the emoji slightly.
- **Showcase Figure:** Product mockup image with a tilt transform and a colored ambient glow behind it, floating gently, capped with a pill caption (colored dot + label) and a short description line.
- **Flow Step Card:** Numbered (01–04) card with a yellow icon chip, bold title, and short body copy — kept intentionally simple to contrast with the busier hero/showcase sections.
- **Live word-swap headline:** The hero's rotating keyword (연인/캐릭터/반려동물) uses a highlighter-style yellow underline behind the animated word, reinforcing the "this is personal" message without extra UI chrome.
