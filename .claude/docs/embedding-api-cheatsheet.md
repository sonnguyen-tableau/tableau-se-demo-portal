# Tableau Embedding API v3 — Cheatsheet

Quick-reference for the React components, props, and events. The on-demand skill `tableau-embed-component` covers patterns; this is the lookup table.

> Source: <https://help.tableau.com/current/api/embedding_api/en-us/>. Pin npm package version to the Tableau Cloud release.

## Components

```
<TableauViz>          — view / dashboard
<TableauPulse>        — Pulse metric card
<TableauAuthoringViz> — web authoring (edit/save)
```

## TableauViz props (most-used)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | string | required | full view URL incl. site path |
| `token` | string | required (when not signed in) | Connected App JWT |
| `toolbar` | "top" \| "bottom" \| "hidden" | "top" | |
| `hideTabs` | bool | false | hide multi-sheet tabs |
| `device` | "desktop" \| "tablet" \| "phone" | "desktop" | |
| `width` / `height` | string | auto | CSS lengths |
| `disableUrlActionsPopups` | bool | false | useful in custom-menu setups |
| `instanceIdToClone` | string | undefined | clone a custom view |
| `iframeAuth` | bool | **false** | **do not enable** (legacy flow) |

## TableauViz events

| Web attribute | React hook | Payload |
| --- | --- | --- |
| `onFirstInteractive` | `useTableauVizFirstInteractiveCallback` | `{target: viz}` |
| `onFirstVizSizeKnown` | `useTableauVizFirstVizSizeKnownCallback` | size |
| `onFilterChanged` | `useTableauVizFilterChangedCallback` | filters |
| `onParameterChanged` | `useTableauVizParameterChangedCallback` | parameter |
| `onMarkSelectionChanged` | `useTableauVizMarksSelectedCallback` | marks |
| `onTabSwitched` | `useTableauVizTabSwitchedCallback` | sheet |
| `onCustomMarkContextMenuEvent` | `useTableauVizCustomMarkContextMenuCallback` | menuId, marks |
| `onCustomViewLoaded` etc. | `useTableauVizCustomViewCallback` | custom view |
| `onSummaryDataChanged` | `useTableauSummaryDataChangedCallback` | aggregated data |
| `onVizLoadError` | (web attr only — listen via addEventListener) | error code |
| `onUrlAction` | `useTableauVizUrlActionCallback` | URL action |

## Programmatic control

```ts
const viz = vizRef.current;
const sheet = viz.workbook.activeSheet;

// Filters
await sheet.applyFilterAsync("Region", ["EMEA"], "REPLACE");
await sheet.applyRangeFilterAsync("OrderDate", { min: new Date("2026-01-01"), max: new Date("2026-03-31") });
await sheet.clearFilterAsync("Region");

// Parameters
await viz.workbook.changeParameterValueAsync("ReportingCurrency", "EUR");

// Tabs / sheets
await viz.workbook.activateSheetAsync("Regional Performance");

// Mark selection
await sheet.selectMarksByValueAsync([{ fieldName: "CountryCode", value: "DE" }], "REPLACE");
await sheet.clearSelectedMarksAsync();

// Data extraction
const summary = await sheet.getSummaryDataAsync({ ignoreSelection: true });
const underlying = await sheet.getUnderlyingDataAsync({ maxRows: 1000 });

// Export
await viz.exportImageAsync();
await viz.exportPDFAsync();
await viz.exportCrossTabAsync();
```

## Custom context menu (Phase 4 "Ask AI")

```tsx
<TableauViz
  // ...
  onCustomMarkContextMenuEvent={(e) => {
    const { menuId, marks } = e.detail;
    if (menuId === "ask-ai") {
      openChatPanelWithContext({ marks });
    }
  }}
/>
```

Register the menu item in Tableau Desktop on the view: Dashboard menu → "Add custom mark context menu" → set menuId="ask-ai".

## TableauPulse props

| Prop | Type | Notes |
| --- | --- | --- |
| `src` | string | `<site>/pulse/site/<siteId>/metrics/<metricId>` |
| `token` | string | same JWT as TableauViz on the page |
| `layout` | "card" \| "expanded" | |
| `theme` | "light" \| "dark" | |
| `hideTimeComparison` | bool | |
| `disableExportPDF` etc. | various toggles | |

## TableauPulse events

| Hook | Purpose |
| --- | --- |
| `useTableauPulseFirstInteractiveCallback` | ready |
| `useTableauPulseInsightDiscoveredCallback` | new insight surfaced |
| `useTableauPulseFiltersChangedCallback` | filter changed |
| `useTableauPulseTimeDimensionChangedCallback` | DAY → WEEK etc. |
| `useTableauPulseErrorCallback` | error |
| `useTableauPulseUrlChangedCallback` | navigation |

## Loading the JS library

The React package brings the embedding library along. If you instead want raw web components in a non-React surface:

```html
<script type="module"
  src="https://<your-site>/javascripts/api/tableau.embedding.3.latest.min.js"></script>
<tableau-viz src="..." token="..."></tableau-viz>
```

In our project we always use the React package.

## Version-pinning rule

Embedded API React must match the Tableau Cloud minor release. Set in `apps/web/package.json`:

```json
"@tableau/embedding-api-react": "~3.14.0"
```

CI fails if the installed major.minor differs from the configured `TABLEAU_SITE_VERSION` env var.
