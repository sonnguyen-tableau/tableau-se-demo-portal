---
version: alpha
name: Tableau AI Portal
description: >
  Multi-tenant embedded analytics portal. Visual identity is Salesforce-modern:
  clean, data-dense, high-contrast. Per-tenant brand colors override base tokens
  at runtime via CSS custom properties — every value marked (tenant-override)
  can be replaced by the tenant's BrandTheme extracted in the factory pipeline.

colors:
  # Base palette — Salesforce Lightning Design System lineage
  primary:          "#0176d3"   # SF Blue 70 — interactive actions, links, focus rings
  primary-light:    "#1b96ff"   # SF Blue 60 — hover states, secondary CTAs
  primary-dark:     "#0b5cab"   # SF Blue 80 — pressed states, active indicators
  primary-subtle:   "#eef4ff"   # SF Blue 10 — tinted backgrounds, callouts
  primary-muted:    "#cfe4fe"   # SF Blue 20 — subtle fills, tag backgrounds

  brand-navy:       "#032d60"   # SF Blue 90 — sidebar bg, inverted surfaces
  brand-ink:        "#0b1220"   # deepest dark — inverted text, footer

  # Neutrals — cool-toned, reads "modern data platform"
  neutral-1:        "#ffffff"
  neutral-2:        "#f8f9fb"
  neutral-3:        "#e8eaee"
  neutral-4:        "#c9cdd4"
  neutral-5:        "#9aa0ab"
  neutral-6:        "#6b7280"
  neutral-7:        "#4b5563"
  neutral-8:        "#374151"
  neutral-9:        "#1f2937"
  neutral-10:       "#0b1220"

  # Semantic
  success:          "#2e844a"
  warning:          "#fe9339"
  error:            "#ea001e"

  # Tenant-overridable brand variables (runtime CSS vars)
  tenant-primary:   "#0176d3"   # --brand-primary   (tenant-override)
  tenant-secondary: "#1b96ff"   # --brand-secondary (tenant-override)
  tenant-neutral:   "#032d60"   # --brand-neutral   (tenant-override)

typography:
  display:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: -0.02em

  h1:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.286
    letterSpacing: -0.015em

  h2:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.364
    letterSpacing: -0.01em

  h3:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.444
    letterSpacing: -0.005em

  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5

  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.571

  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.385

  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.333
    letterSpacing: 0.01em

  meta:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.273
    letterSpacing: 0.02em

  mono:
    fontFamily: "JetBrains Mono"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6

rounded:
  xs:   4px
  sm:   6px
  md:   8px
  lg:   12px
  xl:   16px
  2xl:  20px
  3xl:  28px
  full: 9999px

spacing:
  1:  4px
  2:  8px
  3:  12px
  4:  16px
  5:  20px
  6:  24px
  8:  32px
  10: 40px
  12: 48px
  16: 64px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-1}"
    rounded: "{rounded.md}"
    typography: "{typography.body}"

  button-secondary:
    backgroundColor: "transparent"
    borderColor: "{colors.neutral-3}"
    textColor: "{colors.neutral-9}"
    rounded: "{rounded.md}"
    typography: "{typography.body}"

  sidebar:
    backgroundColor: "{colors.tenant-neutral}"   # tenant-override — dark navy by default
    textColor: "rgba(255,255,255,0.70)"
    activeTextColor: "{colors.neutral-1}"
    activeBgColor: "rgba(255,255,255,0.10)"
    width: 240px

  card:
    backgroundColor: "{colors.neutral-1}"
    borderColor: "{colors.neutral-3}"
    rounded: "{rounded.lg}"
    shadow: "elev-1"

  input:
    backgroundColor: "{colors.neutral-1}"
    borderColor: "{colors.neutral-3}"
    focusBorderColor: "{colors.primary}"
    rounded: "{rounded.md}"
    typography: "{typography.body}"

  badge:
    rounded: "{rounded.full}"
    typography: "{typography.meta}"
---

# Tableau AI Portal — Design System

## Overview

Salesforce-modern meets data-platform precision. The portal is designed for enterprise analytics users who spend hours inside dashboards — density and legibility come first, decoration comes last. The visual language inherits Salesforce Lightning Design System (SLDS) conventions but is refreshed for a dark-sidebar, light-content layout that feels closer to a modern SaaS tool than a traditional BI portal.

**Personality:** Professional, trustworthy, data-forward. Not playful. Every element earns its place.

**Primary audience:** Business analysts, data consumers, and internal Salesforce demo engineers.

**Multi-tenant context:** Every customer deployment overrides three CSS custom properties at runtime — `--brand-primary`, `--brand-secondary`, `--brand-neutral` — derived from the tenant's own brand extracted by the factory pipeline. These control interactive elements, sidebar color, and accent usage throughout the portal. All color decisions must hold at ≥ 4.5:1 WCAG AA contrast when these overrides are applied.

## Colors

The palette has two layers: a fixed structural palette (SF Blue + cool neutrals) and a dynamic brand layer overridden per tenant.

- **Primary (#0176d3 → `--brand-primary`):** SF Blue 70. All interactive affordances — buttons, links, focus rings, progress bars. Replaced by tenant brand color at runtime; must maintain ≥ 4.5:1 contrast against white (#ffffff).
- **Primary Light (#1b96ff):** SF Blue 60. Hover states on primary actions and secondary CTA buttons.
- **Primary Dark (#0b5cab):** SF Blue 80. Pressed/active states. Also used for `ring-focus` composite shadow.
- **Primary Subtle (#eef4ff):** SF Blue 10. Tinted callout backgrounds, active sidebar item fill.
- **Brand Navy (#032d60 → `--brand-neutral`):** SF Blue 90. Sidebar and inverted surface background. Replaced by tenant neutral override.
- **Neutrals (1–10):** Cool-toned grey ramp. `neutral-2` (#f8f9fb) is the default page background. `neutral-9` (#1f2937) is the primary text color. Avoid warm greys — they read as legacy.
- **Semantic:** Success (#2e844a), Warning (#fe9339), Error (#ea001e) — never override with brand colors.

Avoid using more than two brand colors per screen. The tenant's primary drives CTAs; the neutral drives the sidebar. Secondary fills icon tints and selected states only.

## Typography

Two typefaces: **Inter** for all UI text, **JetBrains Mono** for code, IDs, and technical values.

Inter is loaded via `next/font/google` with `display: swap`. No decorative typefaces. No system-default serifs.

- **Display (40px / 800):** Page heroes and empty states only. Never inside data tables.
- **H1 (28px / 700):** Page titles — one per page.
- **H2 (22px / 700):** Section headings, modal titles.
- **H3 (18px / 600):** Card headings, sidebar section labels.
- **Body (14px / 400):** Default text for labels, descriptions, form values.
- **Body SM (13px / 400):** Table cells, secondary metadata. Replaces `text-sm` in new work.
- **Caption (12px / 400):** Supplementary info, timestamps, tertiary labels.
- **Meta (11px / 500):** Badges, status pills, sidebar nav items at secondary hierarchy level. Use sparingly — this size requires 500 weight minimum for legibility.
- **Mono (13px / 400):** Token IDs, URLs, job IDs, code snippets. Always `font-feature-settings: "tnum"`.

Tenant `font_family` from the factory pipeline replaces `--font-sans` globally. Every typography level inherits from this variable.

## Layout

The portal uses a fixed two-column layout:

- **Sidebar:** 240px fixed, dark background (`--brand-neutral`), always visible on ≥ md breakpoints. Collapses to icon-only on mobile (hidden by default, toggle via hamburger).
- **Content area:** `flex-1`, light background (`surface-base: #ffffff`). Max content width `max-w-7xl` centered. Page padding: `px-6 py-8` on desktop, `px-4 py-6` on mobile.
- **Chat panel:** 380px right-side drawer. Opens over content without shifting layout (`position: fixed`).

Grid for content pages: 12-column, `gap-6`. Cards span 4, 6, or 12 columns depending on importance. Never 3-column on data-heavy screens — cognitive overhead.

Spacing scale is 4px base. Use multiples of 4 exclusively. No `px-5` (`20px`) at component boundaries; prefer `px-4` or `px-6`.

## Elevation & Depth

Five elevation levels using layered box shadows. Only the sidebar and modals use strong elevation — content cards use `elev-1` maximum.

- **elev-0:** `0 0 0 1px rgba(15,23,42,0.06)` — subtle border replacement. Use for cards on colored backgrounds.
- **elev-1:** `0 1px 2px rgba(...0.06), 0 0 0 1px rgba(...0.05)` — default card elevation.
- **elev-2:** `0 4px 12px rgba(...0.08)` — hover state for interactive cards, dropdowns.
- **elev-3:** `0 12px 32px rgba(...0.12)` — floating panels, popovers, tooltips.
- **elev-4:** `0 24px 56px rgba(...0.18)` — modals, dialogs, command palette.
- **glow-brand:** Focus + brand glow composite. Used for active Tableau embed frames and primary button focus.
- **ring-focus:** `0 0 0 2px white, 0 0 0 4px --brand-primary` — keyboard focus ring. Required on all interactive elements.

Never use `drop-shadow` CSS filter — use `box-shadow` only for predictable rendering inside Tableau embed iframes.

## Shapes

Corner radius scale: `xs (4px)` → `3xl (28px)` → `full`.

- **Buttons:** `rounded-md (8px)`. Never pill-shaped for primary actions.
- **Cards:** `rounded-lg (12px)`.
- **Inputs:** `rounded-md (8px)`.
- **Badges / pills:** `rounded-full`.
- **Modals / drawers:** `rounded-xl (16px)` on floating corners only; full-height drawers have no radius on the attached edge.
- **Avatar / icons:** `rounded-full` for user avatars; `rounded-sm (6px)` for feature icons.

Avoid mixing radii within a single component. A card with `rounded-lg` must use `rounded-lg` on its inner header too, never `rounded-md`.

## Components

### Button

Primary: solid brand fill, white text, `rounded-md`. Hover: `--brand-primary` at 90% opacity. Active: `primary-dark`. Disabled: 40% opacity, no pointer events.

Secondary: transparent fill, `neutral-3` border, `neutral-9` text. Hover: `surface-muted` fill.

Destructive: `error (#ea001e)` fill, white text. Used only in Danger Zone sections.

Never use icon-only buttons without a tooltip or `aria-label`.

### Sidebar Navigation

Dark background (`--brand-neutral`). Two hierarchy levels:
- **Section headers (H3 / meta):** Uppercase, 11px, `white/40`, no interaction.
- **Nav items:** 13px, `white/70` default, `white/100` active, `white/6` active background fill, `rounded-md`. Active item uses a 2px left accent strip in `--brand-primary`.

Folder tree items (ProjectTree): 13px, indent 12px per depth level. Workbook links: 13px, `white/55`. Both updated from previous `text-meta (11px)` to improve readability.

### Chat Panel

Right-side fixed drawer, 380px wide. AI responses use `surface-subtle` background with `rounded-lg` bubbles. Tool-use events render as collapsed `<details>` elements to avoid cluttering the conversation.

### Tableau Embed

`<TableauViz>` frames receive `box-shadow: glow-brand` when focused. JWT minted once per page load — never per component. Embed container uses `rounded-lg overflow-hidden` to clip Tableau's internal scrollbars.

### Factory Pipeline (FactoryProgress)

11 stages rendered as a vertical list. Status icons: ✅ ok, ⏳ running, ❌ error, ⏭️ skipped. Progress bar uses `--brand-primary` fill, animated via CSS transition. Delivery screen uses `border-green-400 bg-green-50` regardless of tenant brand — neutral success color is never overridden.

## Do's and Don'ts

**Do:**
- Use `--brand-primary` for all interactive elements so tenant overrides propagate automatically.
- Verify WCAG AA (4.5:1) contrast whenever a tenant brand color is applied on white or `surface-subtle`.
- Keep sidebar text at ≥ 13px (updated from 11px meta size).
- Use `elev-1` for default cards; escalate only when the element floats above page content.
- Use `font-feature-settings: "tnum"` on all numeric data in tables.
- Mint exactly one Tableau JWT per page load and share it across all embed components on that page.

**Don't:**
- Don't hard-code `#0176d3` in component code — always reference `var(--brand-primary)` or `bg-brand`.
- Don't use more than 2 brand colors per screen — primary for action, neutral for structure.
- Don't apply `glow-brand` shadow inside Tableau embed iframes — it breaks cross-origin compositing.
- Don't use `text-meta (11px)` for interactive labels — minimum interactive text size is 12px.
- Don't override semantic colors (success/warning/error) with tenant brand colors.
- Don't use `drop-shadow` filter — always `box-shadow`.
- Don't render raw strings from Tableau (workbook names, field descriptions) without sanitization — treat as untrusted input (prompt injection vector).
