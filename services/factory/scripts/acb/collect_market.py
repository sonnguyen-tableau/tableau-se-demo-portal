"""Collect Vietnam CAPITAL-MARKET data from free public JSON APIs.

The capital-markets block is the one part of the demo that is cleanly
collectable live and for free — no scraping, no key, just public JSON:

  - TCBS Stock Insight   : VNINDEX daily OHLCV (primary)
  - VNDIRECT DCHART      : VNINDEX daily history (fallback)

We fetch the VNINDEX daily close for 2024-01-01 .. today, then DERIVE the
day/MTD/YTD return series from it. Turnover, foreign flow, and market P/E-P/B
have public endpoints too but are intentionally left to the calibrated mock
here to keep this collector dependency-light and robust for a demo.

Every collected row is stamped ``MockData=0`` with the real trade date; if BOTH
providers fail (offline / rate-limited / schema drift) we fall back to the
calibrated generator (``MockData=1``) so the demo never breaks.

Run:
  uv run python scripts/acb/collect_market.py            # print a summary
  uv run python scripts/acb/collect_market.py --csv OUT  # write market_daily.csv
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # services/factory
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
from sources import Provenance  # noqa: E402

_START = datetime(2024, 1, 1, tzinfo=UTC)
_TIMEOUT = 20.0


def _to_epoch(dt: datetime) -> int:
    return int(dt.timestamp())


def _fetch_tcbs() -> pd.DataFrame | None:
    """VNINDEX daily bars from TCBS public API. Returns Date/VnIndex or None."""
    import httpx

    url = "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term"
    params = {
        "ticker": "VNINDEX",
        "type": "index",
        "resolution": "D",
        "from": _to_epoch(_START),
        "to": _to_epoch(datetime.now(UTC)),
    }
    try:
        r = httpx.get(url, params=params, timeout=_TIMEOUT,
                      headers={"User-Agent": "acb-market-intel/1.0"})
        r.raise_for_status()
        data = r.json().get("data", [])
        if not data:
            return None
        rows = []
        for bar in data:
            # TCBS returns tradingDate ISO string + close
            ts = bar.get("tradingDate") or bar.get("date")
            close = bar.get("close")
            if ts is None or close is None:
                continue
            d = pd.to_datetime(ts).tz_localize(None).normalize()
            rows.append({"Date": d.to_pydatetime(), "VnIndex": round(float(close), 2)})
        df = pd.DataFrame(rows)
        return df if len(df) > 100 else None
    except Exception as e:
        print(f"  [tcbs] failed: {type(e).__name__}: {e}")
        return None


def _fetch_vndirect() -> pd.DataFrame | None:
    """VNINDEX daily history from VNDIRECT DCHART. Returns Date/VnIndex or None."""
    import httpx

    url = "https://dchart-api.vndirect.com.vn/dchart/history"
    params = {
        "resolution": "D",
        "symbol": "VNINDEX",
        "from": _to_epoch(_START),
        "to": _to_epoch(datetime.now(UTC)),
    }
    try:
        r = httpx.get(url, params=params, timeout=_TIMEOUT,
                      headers={"User-Agent": "acb-market-intel/1.0"})
        r.raise_for_status()
        j = r.json()
        ts, closes = j.get("t", []), j.get("c", [])
        if not ts or len(ts) != len(closes):
            return None
        rows = [{"Date": datetime.fromtimestamp(int(t), tz=UTC)
                 .replace(hour=0, minute=0, tzinfo=None),
                 "VnIndex": round(float(c), 2)} for t, c in zip(ts, closes, strict=True)]
        df = pd.DataFrame(rows)
        return df if len(df) > 100 else None
    except Exception as e:
        print(f"  [vndirect] failed: {type(e).__name__}: {e}")
        return None


def _derive_returns(df: pd.DataFrame, tenant_id: str) -> pd.DataFrame:
    """Add ChangePct / ReturnMtdPct / ReturnYtdPct + provenance to a Date/VnIndex frame."""
    df = df.sort_values("Date").reset_index(drop=True)
    df["Year"] = df["Date"].dt.year
    df["MonthNum"] = df["Date"].dt.month
    df["ChangePct"] = (df["VnIndex"].pct_change() * 100).round(2)

    # MTD base = last close of prior month; YTD base = last close of prior Dec.
    df["ym"] = df["Year"] * 100 + df["MonthNum"]
    month_last = df.groupby("ym")["VnIndex"].last()
    dec_last = df[df["MonthNum"] == 12].groupby("Year")["VnIndex"].last()

    def mtd(row):
        prev_ym = row["ym"] - 1 if row["MonthNum"] > 1 else (row["Year"] - 1) * 100 + 12
        base = month_last.get(prev_ym)
        return round((row["VnIndex"] / base - 1) * 100, 2) if base else None

    def ytd(row):
        base = dec_last.get(row["Year"] - 1)
        return round((row["VnIndex"] / base - 1) * 100, 2) if base else None

    df["ReturnMtdPct"] = df.apply(mtd, axis=1)
    df["ReturnYtdPct"] = df.apply(ytd, axis=1)

    prov = Provenance.of("HOSE", mock=False)
    df["Source"] = prov.source
    df["SourceUrl"] = prov.source_url
    df["DataDate"] = df["Date"]
    df["MockData"] = 0
    df["TenantId"] = tenant_id
    return df.drop(columns=["ym"])


def collect_vnindex(tenant_id: str = "acb") -> tuple[pd.DataFrame | None, str]:
    """Return (DataFrame with derived returns, provider_name) or (None, 'none')."""
    # VNDIRECT first — verified reliable; TCBS as a secondary (its long-term
    # bars endpoint has intermittently 404'd).
    for name, fetch in (("vndirect", _fetch_vndirect), ("tcbs", _fetch_tcbs)):
        print(f"  trying {name} ...")
        raw = fetch()
        if raw is not None and len(raw):
            print(f"  {name}: {len(raw)} daily bars "
                  f"({raw['Date'].min().date()} -> {raw['Date'].max().date()})")
            return _derive_returns(raw, tenant_id), name
    return None, "none"


def main() -> int:
    df, provider = collect_vnindex()
    if df is None:
        print("LIVE COLLECTION UNAVAILABLE — the demo falls back to the calibrated")
        print("generator (app.generators.acb, MockData=1). Nothing written.")
        return 0

    print(f"\nLIVE VN-Index via {provider}: {len(df)} rows, MockData=0")
    print(f"  latest close {df['VnIndex'].iloc[-1]} on {df['Date'].iloc[-1].date()}")
    print(f"  YTD {df['ReturnYtdPct'].iloc[-1]}%  MTD {df['ReturnMtdPct'].iloc[-1]}%")

    if "--csv" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--csv") + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(out, index=False)
        print(f"  wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
