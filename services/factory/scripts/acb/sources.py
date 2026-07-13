"""ACB Market Intelligence — data-source registry (public, legal VN providers).

Single source of truth for every metric's provenance. The generator
(``app.generators.acb``) and the collectors (``collect_market.py`` /
``collect_macro.py``) both stamp their rows from here so a metric's
``Source`` / ``SourceUrl`` never drifts between the mock and the real path.

Every value the demo ships is either:
  - collected live from a free public API (``mock=False``, real ``DataDate``), or
  - calibrated synthetic from the generator (``mock=True``) when the live source
    is paywalled / fragile HTML / unreachable.

No paywalled or ToS-restricted endpoint is scraped. Macro series (GSO/SBV/PMI)
are published as narrative HTML/PDF that drift constantly — we do NOT scrape
them blindly; we prefer the calibrated mock and leave a clearly-labelled hook.
"""

from __future__ import annotations

from dataclasses import dataclass

# Canonical provider registry — keep in sync with app.generators.acb._SRC.
SOURCES: dict[str, tuple[str, str]] = {
    "GSO": ("Tổng cục Thống kê (GSO)", "https://www.gso.gov.vn/en/"),
    "SBV": ("Ngân hàng Nhà nước (SBV)", "https://www.sbv.gov.vn/"),
    "FIA": ("Cục Đầu tư nước ngoài (FIA/MPI)", "https://fia.mpi.gov.vn/"),
    "PMI": ("S&P Global — Vietnam Manufacturing PMI", "https://www.pmi.spglobal.com/"),
    "HOSE": ("Sở GDCK TP.HCM (HOSE)", "https://www.hsx.vn/"),
    "DERIVED": ("Tính toán từ dữ liệu HOSE", "https://www.hsx.vn/"),
    # Free JSON aggregators used by the live collectors (attribution).
    "TCBS": ("TCBS Stock Insight (public API)",
             "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term"),
    "VNDIRECT": ("VNDIRECT DCHART (public API)",
                 "https://dchart-api.vndirect.com.vn/dchart/history"),
}


@dataclass(frozen=True)
class Provenance:
    source: str
    source_url: str
    mock: bool

    @classmethod
    def of(cls, key: str, *, mock: bool) -> Provenance:
        name, url = SOURCES[key]
        return cls(source=name, source_url=url, mock=mock)


# Which metric keys are realistically machine-collectable from a free API today.
# Everything else defaults to the calibrated mock. (Capital-markets block is
# fully API-collectable via TCBS/VNDIRECT; USD/VND has clean public feeds; the
# rest of macro is fragile → mock.)
LIVE_COLLECTABLE: frozenset[str] = frozenset({
    "vnindex", "return_mtd", "return_ytd", "market_pe", "market_pb",
    # turnover + foreign flow ARE on TCBS but under separate endpoints;
    # left to the mock path here to keep the collector dependency-light.
})
