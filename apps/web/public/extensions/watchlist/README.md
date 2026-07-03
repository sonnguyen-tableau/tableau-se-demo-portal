# AI Watchlist — Tableau Dashboard Extension

Nam A Bank credit-risk watchlist as an interactive Tableau **dashboard
extension**. Renders at-risk customers in an HTML table with an inline PD-score
bar, click-to-filter, and a "Giải thích" button that streams an AI narrative
from the portal's `/api/chat` endpoint.

## Files

| File | Purpose |
|------|---------|
| `watchlist.trex` | Extension manifest (loaded into Tableau) |
| `watchlist.html` | Extension shell |
| `watchlist.css` | Nam A Bank branded styling |
| `watchlist.js` | Logic: read worksheet data, render table, filter, AI call |

## Hosting

Served static from the portal (Vercel) at:
`https://<portal-origin>/extensions/watchlist/watchlist.html`

Same-origin with `/api/chat`, so the NextAuth session cookie authenticates the
AI call automatically — no separate token minting.

## Setup on Tableau Cloud (one-time per site)

1. **Add the extension domain to the site safe list**
   Settings → Extensions → *Add* the portal origin (e.g.
   `https://tableau-portal-mu.vercel.app`) with **Full Data** allowed and
   prompt disabled (or enabled — user gets a one-time consent).

2. **Add the extension to a dashboard** (in Tableau Desktop)
   - Objects pane → drag **Extension** onto the dashboard.
   - Choose **Access Local Extensions** → select `watchlist.trex`
     (or paste the hosted URL if adding by URL).
   - Ensure the dashboard has a worksheet exposing the columns:
     `CustomerName`, `RiskBand`, `PdScore`, `TopReason`
     (the "AI Watchlist" sheet in *Nam A Bank - Rui ro Tin dung* provides these).
   - The extension auto-selects a worksheet whose name contains
     "watchlist" / "rủi ro"; otherwise pick it from the dropdown.
   - Save & republish the workbook.

3. **Verify**
   - Open the dashboard in the portal (`/t/nam-a-bank/...`).
   - The table populates; click a row → dashboard filters to that customer;
     click **Giải thích** → AI narrative streams into the drawer.

## Column contract

The JS does flexible (case-insensitive, VN/EN) matching:
- Name: `CustomerName` / "khách"
- Band: `RiskBand` / "nhóm rủi ro"
- PD: `PdScore` / "pd"
- Reason: `TopReason` / "lý do"

## Notes / limitations

- Requires the user to be signed into the portal (session cookie) for the AI
  button to work — the extension runs inside the embedded viz iframe which is
  same-origin with the portal.
- `full data` permission prompts the viewer once on first load.
- Not supported on Tableau Public; desktop browser only for the AI feature.
