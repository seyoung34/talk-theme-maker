---
name: Aura Canvas
colors:
  surface: '#fbf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#fbf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee9'
  surface-container-high: '#eae8e3'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#4b4732'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#7c775f'
  outline-variant: '#cdc7aa'
  surface-tint: '#6a5f00'
  primary: '#6a5f00'
  on-primary: '#ffffff'
  primary-container: '#fee500'
  on-primary-container: '#716600'
  inverse-primary: '#dec800'
  secondary: '#2a6767'
  on-secondary: '#ffffff'
  secondary-container: '#aeebea'
  on-secondary-container: '#2f6c6b'
  tertiary: '#735c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffe18e'
  on-tertiary-container: '#7b6200'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#fde400'
  primary-fixed-dim: '#dec800'
  on-primary-fixed: '#201c00'
  on-primary-fixed-variant: '#504700'
  secondary-fixed: '#b1eeed'
  secondary-fixed-dim: '#95d1d0'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#064f4f'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#fbf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 40px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The design system is a high-end creative utility that balances professional precision with emotional warmth. It is designed for creators who treat digital themes as a form of personal expression. The aesthetic direction is **Modern Minimalist with Tactile Warmth**, prioritizing a "gallery" feel where the user's creations are the focal point.

The visual language avoids the coldness of traditional SaaS by using soft, organic curves and a sophisticated, low-contrast foundation. It evokes a sense of calm focus, inviting users into a flow state of creation. Every interaction should feel intentional, premium, and polished, reflecting the quality of the themes being produced.

## Colors

The palette is anchored in a refined interpretation of the iconic Kakao identity, elevated for a premium audience.

- **Primary (Core Yellow):** A vibrant but controlled yellow (#FEE500), used sparingly for primary actions and brand recognition.
- **Secondary (Deep Teal):** A sophisticated dark teal (#004C4C) provides a grounded, professional contrast to the yellow, used for text and heavy structural elements.
- **Tertiary (Soft Gold):** An elegant gold (#D4AF37) used for highlights, premium features, and subtle "creative" accents.
- **Neutral (Warm Sand):** The base is a soft off-white (#F9F7F2) rather than pure white, creating an inviting, paper-like surface that reduces eye strain.
- **Status:** Use muted, low-saturation tones for Success (sage), Warning (ochre), and Error (dusty rose) to maintain the premium feel.

## Typography

This design system utilizes a dual-font pairing to achieve a balance of modern energy and professional clarity. 

**Plus Jakarta Sans** is used for headings and display text. Its soft, geometric curves mirror the rounded UI elements, creating a cohesive visual rhythm. **Manrope** is used for body text and functional labels, chosen for its exceptional readability and neutral, modern structure.

Maintain a strong hierarchy by using significant weight differences rather than just size. Labels should often use uppercase with slight tracking (0.05em) to differentiate functional metadata from narrative content.

## Layout & Spacing

The layout philosophy is built on **Generous Breathing Room**. To convey a premium feel, the design system utilizes larger-than-average margins and padding, ensuring elements never feel cramped.

- **Grid:** A 12-column fluid grid for desktop with 24px gutters. On mobile, a single-column layout with 20px side margins.
- **Rhythm:** All spacing must be multiples of the 8px base unit. 
- **White Space:** Use `stack-lg` (48px) to separate major sections, encouraging the user to focus on one creative task at a time.
- **Alignment:** Content is generally center-aligned or left-aligned within a max-width container to maintain a focused, editorial appearance.

## Elevation & Depth

This design system uses a **Soft Tonal Layering** approach combined with **Ambient Shadows**. Instead of harsh borders, depth is created through subtle shifts in background color and highly diffused shadows.

- **Level 0 (Base):** Warm Sand (#F9F7F2) background.
- **Level 1 (Cards/Panels):** Pure White (#FFFFFF) surfaces with a very soft, 15% opacity Deep Teal shadow (blur: 20px, y: 4px).
- **Level 2 (Modals/Popovers):** Pure White with a more pronounced, "floating" shadow (blur: 40px, y: 12px) and a subtle 1px border in a slightly darker neutral tone (5% opacity secondary).
- **Interactions:** Hover states should not use "glows," but rather a slight upward lift (y-axis shift) and a deepening of the ambient shadow.

## Shapes

The shape language is defined by **Friendly Sophistication**. Avoid sharp corners entirely to maintain emotional warmth.

- **Standard Elements:** 16px radius for buttons, input fields, and small cards.
- **Large Containers:** 24px-32px radius for main editor panels and image previews to create a soft, framed effect.
- **Pill Shapes:** Used exclusively for tags, chips, and the primary "floating" navigation elements.
- **Borders:** When used, borders should be 1.5px wide and colored with a 10% opacity of the Secondary color to ensure they feel "drawn" rather than "engineered."

## Components

- **Buttons:** Primary buttons use the Core Yellow with Deep Teal text. They should have a 16px corner radius and a subtle "lift" on hover. Secondary buttons are ghost-style with a 1.5px teal border.
- **Creative Cards:** Used for theme previews. These should have a 24px radius, no visible border, and a soft ambient shadow. Typography within cards should be strictly hierarchical.
- **Input Fields:** Large, 16px rounded containers with a Soft Sand background. The focus state uses a 2px Deep Teal border to signal precision.
- **Chips & Tags:** Pill-shaped with a 10% opacity tint of the Secondary or Tertiary color. Used for categorizing theme styles (e.g., "Minimal", "Pastel").
- **Lists:** Clean, spacious rows with subtle dividers (1px, 5% opacity Secondary). Each row should have a minimum height of 64px to feel premium.
- **Live Preview Toggle:** A specialized component that allows users to switch between "Edit" and "Preview" modes, utilizing a pill-shaped segmented control with a sliding high-contrast indicator.

