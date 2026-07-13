# ACB Market Intelligence — data pipeline

Synthetic + live data pipeline for the ACB (Ngân hàng Á Châu) "Market
Intelligence" demo: a Vietnam macro + capital-market monitor for Priority-Banking
advisors. Story: **Data → Dashboard → Insight → Advisor Brief → Report**.

## Files

| File | Role |
|---|---|
| `sources.py` | Public data-source registry (GSO/SBV/FIA/PMI/HOSE + TCBS/VNDIRECT). Single source of truth for provenance. |
| `collect_market.py` | **Live** VN-Index daily history from free public JSON APIs (VNDIRECT primary, TCBS fallback). Derives day/MTD/YTD returns. Verified working: 620+ real bars 2024-01→today. |
| `collect_macro.py` | Macro collection **plan** + one live hook (USD/VND via Frankfurter). Honest policy: VN macro (CPI/GDP/FDI/PMI/…) has no stable free API → calibrated mock, source-attributed. |
| `provision_acb.py` | generate → `.hyper` → `.tdsx` → publish `Demo/ACB` datasource (VNPT pattern). `--live` overlays real VN-Index onto `market_daily`. |

The generator itself is `services/factory/app/generators/acb.py`; the column
contract is `packages/factory-schema/market-intelligence.schema.json`.

## Data policy

100% synthetic by default (`MockData=1`), **calibrated** to real published
2024–2025 Vietnam figures (CPI ~3.3–3.6%, VN-Index 1,266→1,560, USD/VND
24,600→26,450, credit +16%, …). Every row carries `Source`, `SourceUrl`,
`DataDate`, `MockData`. With `--live`, the capital-markets rows that match a real
trading day are replaced with genuine VNDIRECT data and flipped to `MockData=0`.

Nothing paywalled or ToS-restricted is scraped. Capital markets are cleanly
free/live; VN macro is mock-by-necessity with a documented integration hook.

## Run

```bash
cd services/factory
uv run python scripts/acb/collect_market.py            # prove live VN-Index works
uv run python scripts/acb/collect_macro.py             # show the macro plan
uv run python scripts/acb/provision_acb.py             # build .hyper + .tdsx (mock)
uv run python scripts/acb/provision_acb.py --live      # overlay real VN-Index
uv run python scripts/acb/provision_acb.py --live --publish   # + publish to Cloud
```

`--publish` needs `services/factory/.env`: `TABLEAU_SITE_URL`,
`TABLEAU_SITE_NAME`, `TABLEAU_PAT_NAME`, `TABLEAU_PAT_SECRET`.
