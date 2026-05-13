---
name: Tableau Embedding API React Component Usage
description: Use when adding or modifying Tableau embedded views, Pulse cards, or web-authoring components in the Next.js portal. Covers TableauViz, TableauPulse, TableauAuthoringViz, required props, event hooks for filter/mark/parameter changes, version-pinning to the Tableau Cloud release, single-JWT-per-page rule, modern auth flow (no third-party cookies), and the React ref pattern.
dependencies: "@tableau/embedding-api-react"
---

# Tableau Embedding API React Component Usage

Use this skill any time you create, modify, or debug `<TableauViz>`, `<TableauPulse>`, or `<TableauAuthoringViz>` in `apps/web/`.

## When to use

- Adding a new dashboard page under `/t/[tenantSlug]/dashboards/[id]`.
- Wiring up agent-aware event listeners (filter, mark selection, parameter change).
- Embedding a Pulse metric card.
- Diagnosing a viz that loads blank, shows a login prompt, or fails with `unknown-auth-error`.

## Choose the right component

| Component | Use when | Required scope in JWT |
| --- | --- | --- |
| `<TableauViz>` | embedding a published view or dashboard | `tableau:views:embed` |
| `<TableauPulse>` | embedding a Pulse metric card | `tableau:insights:embed` |
| `<TableauAuthoringViz>` | letting the user web-edit a workbook in place | `tableau:views:embed_authoring` + `tableau:views:embed` |

## Required props

```tsx
<TableauViz
  src={`${TABLEAU_SITE_URL}/views/Workbook/View`}  // canonical view URL
  token={jwt}                                       // from /api/tableau/token
  toolbar="bottom"                                  // "top" | "bottom" | "hidden"
  hideTabs                                          // optional but usually wanted
  ref={vizRef}                                      // for event handlers / programmatic control
/>
```

Always:

- Provide a **fresh** token (mint per page load, do not cache across users).
- Use the **same** token for every Tableau component on the same page.
- Render under a `'use client'` boundary — the embedding components are client-only.
- Reserve a stable container size; the viz uses lazy-loading and reflows on first paint.

## Version pinning

Pin `@tableau/embedding-api-react` to match the Tableau Cloud site minor version. Use a tilde to allow patch updates only:

```json
"@tableau/embedding-api-react": "~3.14.0"
```

When Tableau Cloud updates (twice a year), bump the minor and retest before merging. The CI workbook contract test catches breakage.

## Canonical TableauViz shell

```tsx
'use client';
import { TableauViz, useTableauVizRef, useTableauVizFirstInteractiveCallback } from "@tableau/embedding-api-react";
import { useVizContext } from "@/components/bridge/VizContextProvider";

export function DashboardShell({ src, token }: { src: string; token: string }) {
  const vizRef = useTableauVizRef();
  const { updateContext } = useVizContext();

  const onFirstInteractive = useTableauVizFirstInteractiveCallback(() => {
    const viz = vizRef.current;
    if (!viz) return;
    updateContext({
      workbook: viz.workbook.name,
      activeSheet: viz.workbook.activeSheet.name,
      ready: true,
    });
  }, []);

  return (
    <TableauViz
      ref={vizRef}
      src={src}
      token={token}
      toolbar="bottom"
      hideTabs
      onFirstInteractive={onFirstInteractive}
    />
  );
}
```

## Agent-aware event hooks (Phase 4)

| Hook | Purpose |
| --- | --- |
| `useTableauVizFilterChangedCallback` | mirror filter state into the agent's system prompt |
| `useTableauVizMarksSelectedCallback` | "Ask AI about this mark" |
| `useTableauVizParameterChangedCallback` | parameter context |
| `useTableauVizTabSwitchedCallback` | active sheet tracking |
| `useTableauVizCustomMarkContextMenuCallback` | wire the custom "Ask AI" right-click action |
| `useTableauPulseInsightDiscoveredCallback` | surface Pulse insights to the chat panel |

## Programmatic control from the agent (Phase 5)

```ts
const viz = vizRef.current;
if (!viz) return;

// Apply a filter
await viz.workbook.activeSheet.applyFilterAsync("Region", ["EMEA"], "REPLACE");

// Switch tabs
await viz.workbook.activateSheetAsync("Regional Performance");

// Highlight marks
await viz.workbook.activeSheet.selectMarksByValueAsync(
  [{ fieldName: "CountryCode", value: "DE" }],
  "REPLACE",
);
```

Always re-check `vizRef.current` is non-null after async boundaries.

## TableauPulse

```tsx
<TableauPulse
  src={`${TABLEAU_SITE_URL}/pulse/site/${siteId}/metrics/${metricId}`}
  token={jwt}   // same token as TableauViz on the page
  layout="card"
  theme="light"
  hideTimeComparison={false}
/>
```

## Modern auth flow (do not regress)

- Embedding API ≥ 3.6 + Tableau ≥ 2023.2 removes the third-party-cookie requirement.
- **Do not set** `iframe-auth` / `iframeAuth`. It silently downgrades to the old flow and loses the `VizLoadError` event.
- Add an `onVizLoadError` handler so we can react to `unknown-auth-error` and force a token refresh.

```tsx
<TableauViz
  // ...
  onVizLoadError={(e) => {
    const detail = JSON.parse(e.detail.message);
    if (detail.errorCode === "unknown-auth-error") {
      // re-mint and re-render
      void refetchToken();
    }
  }}
/>
```

## Common mistakes

1. **Forgetting `'use client'`.** Server Components can't render embed components — you'll get hydration errors.
2. **Container with no height.** The viz iframe collapses to 0px. Reserve `min-height: 600px` or use a sized parent.
3. **Re-rendering on every parent state change.** The viz is expensive to mount — memoize props or split into a stable subtree.
4. **Mixing JWTs across components.** Causes intermittent re-login prompts. Mint once at the route level, prop-drill or context-provide.
5. **Calling `applyFilterAsync` before `onFirstInteractive`.** The workbook isn't ready; the call rejects. Gate programmatic control on a ready flag.

## Related skills

- `tableau-jwt-mint` — how to produce the `token` prop.
- `multitenant-rls` — how filters / user attributes interact with row-level security.
