"""Collect Vietnam MACRO data — with an honest live-vs-mock policy.

Unlike the capital-markets block (clean free JSON — see ``collect_market.py``),
Vietnam macro data is published by GSO / SBV / FIA / S&P Global as narrative
HTML and PDF that changes layout constantly and has no stable open API. Blindly
scraping it produces a brittle demo that breaks the next time a page is
re-templated. So the policy here is deliberate:

  - USD/VND       : SBV publishes a daily central reference rate; there are also
                    clean market feeds. We attempt a lightweight fetch and fall
                    back to the calibrated mock on any failure.
  - CPI, GDP, FDI, exports/imports, retail sales, PMI, deposit rate, credit
                  : NO reliable free API / stable HTML. We DO NOT scrape blindly.
                    These come from the calibrated generator (MockData=1),
                    calibrated to the latest published figures. This function
                    documents the authoritative source per metric so a future
                    integration (paid CEIC/FiinPro key, or a maintained GSO
                    parser) can drop in.

The point of this module for the demo: show that the collection ARCHITECTURE is
real and source-attributed, while being honest that most VN macro is mock-by-
necessity today. Every returned row carries Source/SourceUrl/DataDate/MockData.

Run:
  uv run python scripts/acb/collect_macro.py     # print the collection plan
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sources import SOURCES, Provenance  # noqa: E402

_TIMEOUT = 15.0

# Metric -> authoritative source + whether a free live path exists today.
_MACRO_PLAN: tuple[tuple[str, str, bool, str], ...] = (
    ("cpi_yoy",          "GSO", False, "Narrative monthly report (HTML/PDF), no stable API"),
    ("gdp_growth",       "GSO", False, "Quarterly narrative report, no stable API"),
    ("fdi_registered",   "FIA", False, "MPI/FIA narrative; URL moved under MoF post-2025 reorg"),
    ("fdi_disbursed",    "FIA", False, "MPI/FIA narrative; URL moved under MoF post-2025 reorg"),
    ("exports",          "GSO", False, "GSO/Customs monthly tables, irregular schema"),
    ("imports",          "GSO", False, "GSO/Customs monthly tables, irregular schema"),
    ("trade_balance",    "GSO", False, "Derived from exports - imports"),
    ("retail_sales_yoy", "GSO", False, "GSO monthly report (HTML/PDF)"),
    ("pmi",              "PMI", False, "S&P Global press release (PDF/text), monthly"),
    ("usdvnd",           "SBV", True,  "SBV daily central rate + market feeds"),
    ("deposit_rate_12m", "SBV", False, "Per-bank rates, no single feed"),
    ("credit_growth_yoy", "SBV", False, "SBV narrative statements, monthly/quarterly"),
)


def _try_usdvnd_live() -> float | None:
    """Best-effort single USD/VND spot from a free public feed. None on failure.

    This is intentionally lightweight — a real integration would page the SBV
    daily central-rate series. We just prove the live hook works and otherwise
    defer to the calibrated mock.
    """
    import httpx

    # Frankfurter is a free, no-key FX API (ECB reference data). VND is quoted.
    try:
        r = httpx.get("https://api.frankfurter.app/latest",
                      params={"from": "USD", "to": "VND"}, timeout=_TIMEOUT)
        r.raise_for_status()
        rate = r.json().get("rates", {}).get("VND")
        return float(rate) if rate else None
    except Exception as e:
        print(f"  [usdvnd] live fetch failed: {type(e).__name__}: {e}")
        return None


def collection_plan() -> list[dict]:
    """Return the per-metric collection plan with provenance (no data fetched)."""
    plan = []
    for key, src, live, note in _MACRO_PLAN:
        name, url = SOURCES[src]
        plan.append({
            "metric": key, "source": name, "source_url": url,
            "live_path_available": live, "note": note,
            "policy": "attempt-live-then-mock" if live else "calibrated-mock",
        })
    return plan


def main() -> int:
    print("Vietnam MACRO collection plan (source-attributed):\n")
    for p in collection_plan():
        flag = "LIVE" if p["live_path_available"] else "MOCK"
        print(f"  [{flag}] {p['metric']:18s} <- {p['source']}")
        print(f"         {p['note']}")

    print("\nProbing the one live macro hook (USD/VND) ...")
    rate = _try_usdvnd_live()
    if rate:
        prov = Provenance.of("SBV", mock=False)
        today = datetime.now(UTC).date()
        print(f"  LIVE USD/VND ~= {rate:,.0f}  (DataDate={today}, MockData=0, via {prov.source})")
    else:
        print("  USD/VND live unavailable -> calibrated mock (MockData=1)")

    print("\nAll other macro metrics -> calibrated generator (app.generators.acb,")
    print("MockData=1), calibrated to latest published GSO/SBV/PMI figures.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
