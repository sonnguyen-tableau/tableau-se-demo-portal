---
name: Tenant Hero Variant (Stitch → React)
description: >
  Use when you want a tenant's portal home to feel visually tailored to the
  customer's brand beyond just colors/logo — i.e. a different hero (welcome
  banner) layout. Covers the per-tenant theming model (chartPalette +
  heroVariant), how to design a new hero with Google Stitch / Claude Designer,
  and how to implement it as a vetted React variant in TenantHero.tsx WITHOUT
  forking the single shared portal shell (RLS, i18n, sidebar, dashboards, agent
  all stay identical). Use when the user asks to "make the home page look more
  like <customer>", "add a hero layout", "use Stitch to design the portal", or
  "personalize the tenant landing page".
---

# Tenant Hero Variant — design with Stitch, ship as React

The portal is **one shared Next.js shell** reused by every tenant. Tenants are
personalized at runtime through `TenantTheme` (brand colors, logo, font, tone)
injected as CSS variables — not by forking the frontend per customer. That is
the core architectural value: one code change reaches every tenant, and RLS /
i18n / the AI agent are built in once.

This skill is how you add **visual variety at the one surface where it pays off
in a demo — the home hero (welcome banner)** — while preserving that model.

Related: `new-tenant-portal` (full build), `tableau-exec-dashboard` (workbook
design), `portal-catalog` (folder filtering). Design tokens live in `DESIGN.md`.

## The golden rule

> **Stitch/Designer is a design front-door, not a runtime artifact.**
> Use it to *explore* a layout. Then a developer (you, via Claude Code)
> implements the chosen look as a real React `HeroVariant` using the project's
> design tokens. **Never** paste Stitch's raw HTML/CSS into the running app.

Why: Stitch exports generic HTML + Tailwind that (a) doesn't use our design
system (`sf-*` tokens, `--brand-*` CSS vars, `elev-*` shadows, `text-h1/body`
type scale), (b) knows nothing about RLS, i18n (`t()`), or the JWT/embed rules,
and (c) injecting third-party markup at runtime is an XSS + maintenance hazard.
Translating it to a vetted React variant costs ~20 min and keeps the shell sound.

## What is personalizable today (`TenantTheme`)

Defined in `apps/web/lib/tenant-theme.ts`. All fields flow through the same
store (Vercel KV in prod, `data/tenant-themes.json` in local dev) and the same
API routes, and are backward-compatible (older tenants without the newer fields
render exactly as before):

| Field | Effect | Set by |
|---|---|---|
| `primaryColor` / `secondaryColor` / `neutralColor` | `--brand-primary/secondary/neutral` CSS vars → buttons, links, sidebar, gradients | factory brand extraction + admin editor |
| `sidebarTextColor` | `--sidebar-text` (+ derived muted/dim) | admin editor |
| `fontFamily` | `--font-sans` globally | factory + admin editor |
| `logoUrl` / `logoLayout` | sidebar brand header | factory + admin editor |
| `tone` | AI agent phrasing (`professional`/`playful`/`technical`) | factory + admin editor |
| `chartPalette` | `--brand-chart-1..8` → Vega/agent chart categorical colors. When empty, `resolveChartPalette()` derives a brand-led default | factory (optional) + API |
| `heroVariant` | Which home hero layout renders: `aurora` (default), `editorial`, `spotlight` | admin editor ("Bố cục trang chủ" / Home layout) + factory (optional) |

Everything else (sidebar structure, dashboards, agent, admin) is **identical for
every tenant** and must stay that way.

## The hero contract

The tenant home hero lives in **`apps/web/components/layout/TenantHero.tsx`**
and is selected by `theme.heroVariant`. Every variant must:

1. Render the **same content**: the workspace/tenant name eyebrow, the localized
   welcome title (`t("th.welcome")`) + subtitle (`t("th.subtitle")`), the two
   CTAs (View dashboards → `/t/<slug>/dashboards`, Ask agent → `/t/<slug>/agent`),
   and the optional impressions meter. Reuse the shared `PrimaryCta`, `AgentCta`,
   `ImpressionMeter*`, `WelcomeHeading` helpers — do not re-invent them.
2. Use **brand CSS vars and design tokens**, never hard-coded hex. Colors come
   from `var(--brand-primary)`, `var(--brand-neutral)`, `sf-*` Tailwind classes.
3. Stay **WCAG AA** (≥ 4.5:1) for text on whatever brand background it uses.
   Brand primaries are already AA-darkened at extraction time (`brand.py`), but
   verify your own overlays.
4. Be **self-contained** — no new data fetching, no client hooks. It's a server
   component rendered from `app/t/[tenantSlug]/page.tsx`.

Shipping variants: `aurora` (brand-gradient mesh — the original look, default),
`editorial` (light surface, left brand accent bar), `spotlight` (centered,
brand ring, minimal).

## Workflow: add a new hero variant

### 1. Explore the layout in Stitch (or Claude Designer)

Go to <https://stitch.withgoogle.com>. Give it a prompt like the template below
(fill the brackets). Stitch takes a text prompt + optional image (paste the
customer logo or a screenshot of their real site for palette cues) and returns
UI mockups + generic frontend code, and can "Paste to Figma".

**Prompt template:**

```
Design a SaaS analytics portal home "welcome hero" banner (top section only,
not a full page). Company: <CUSTOMER NAME>, industry: <INDUSTRY>.
Brand colors: primary <#HEX>, secondary <#HEX>, dark/neutral <#HEX>.
It must contain: a small uppercase eyebrow with the workspace name, a large
welcome headline, one line of subtitle, two buttons ("View dashboards" primary,
"Ask the AI agent" secondary), and a compact "views today" usage stat on the
right. Enterprise, data-forward, high-contrast, not playful. Rounded-2xl card,
subtle depth. Give me 2–3 layout variations.
```

Pick the variation you like. You only need it as **visual reference** — grab the
layout idea, spacing, and where the accent sits. Ignore its exact CSS.

> Tip: keep the ask scoped to the **hero only**. The rest of the page (KPI tiles,
> Pulse, recent/popular) is shared and already designed — don't let Stitch
> redesign those.

### 2. Implement it as a React variant

In `apps/web/lib/tenant-theme.ts`:

```ts
export type HeroVariant = "aurora" | "editorial" | "spotlight" | "<yourname>";
export const HERO_VARIANTS: readonly HeroVariant[] =
  ["aurora", "editorial", "spotlight", "<yourname>"] as const;
```

In `apps/web/components/layout/TenantHero.tsx`, add a `case "<yourname>":` to the
`switch` and write a `<YourNameHero {...props} />` component. Copy the closest
existing variant as a starting point and restyle to match your Stitch reference —
reusing `PrimaryCta` / `AgentCta` / `ImpressionMeter*` / `WelcomeHeading`.

In the admin editor `app/t/[tenantSlug]/admin/theme/ThemeEditor.tsx`, add your
variant to `HERO_OPTIONS` and a thumbnail branch in `HeroThumb` so SEs can pick
it (label/description may be in the deployment's UI language).

The Zod enums in these three routes each accept the hero variant — extend all
three to include your new value:
- `app/api/admin/theme/route.ts`
- `app/api/admin/tenants/[slug]/theme/route.ts`
- `app/api/admin/provision/theme/route.ts`

### 3. Verify

```bash
pnpm -F @portal/web typecheck
pnpm -F @portal/web test        # tenant-theme.test.ts covers the theme contract
```

Then run the app (`pnpm dev`), open `/t/<slug>/admin/theme`, pick your variant,
save, and confirm `/t/<slug>` renders it. Check both locales (VI/EN toggle) and
that the CTAs still route correctly.

## Assigning a variant to a tenant

- **Admin UI** (per tenant): `/t/<slug>/admin/theme` → "Home layout" → pick →
  Save. Persists to KV/file via `PUT /api/admin/theme`.
- **Factory auto-provision**: the pipeline can set it during a build. In
  `services/factory/app/models.py` `BrandTheme` has `hero_variant` and
  `chart_palette`; whatever you set flows through the provision callback
  (`pipeline.py` → `PUT /api/admin/provision/theme`).
- **API** (scripted): `PUT /api/admin/tenants/<slug>/theme` with
  `{ "heroVariant": "editorial" }` (internal session) — or the factory path with
  the `X-Factory-Secret` header.

## When NOT to use this

- Don't build a **fully bespoke per-tenant frontend** (the `customise-your-mcp`
  1-repo-per-client model). That throws away multi-tenancy, RLS, and i18n.
- Don't redesign the sidebar, dashboards page, or agent per tenant. Only the
  hero is a per-tenant surface.
- Don't add a variant for a one-off tweak that a color/logo change already
  covers. Variants are for genuinely different *layouts*, not recolors —
  recolors happen automatically through the brand CSS vars.
