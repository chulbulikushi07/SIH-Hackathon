import yfinance as yf
import pandas as pd
import os

# ---- 1. Define your watchlist ----
WATCHLIST = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ITC.NS",       # large-cap (baseline)
    "IRCTC.NS", "ETERNAL.NS", "IDEA.NS", "YESBANK.NS",                   # mid-cap
    "SUZLON.NS", "RTNPOWER.NS", "GTLINFRA.NS", "JPPOWER.NS",            # small-cap / volatile
    "TRIDENT.NS", "SOUTHBANK.NS", "SADBHAV.NS", "RPOWER.NS", "PCJEWELLER.NS",
]

# ---- 2. How far back to pull data ----
PERIOD = "2y"       # 2 years of daily data is enough for rolling stats + a demo
INTERVAL = "1d"      # daily candles

# ---- 3. Where to save output ----
OUT_DIR = "data"
os.makedirs(OUT_DIR, exist_ok=True)


def fetch_stock(ticker: str) -> pd.DataFrame:
    """Download and clean data for one stock."""
    df = yf.download(ticker, period=PERIOD, interval=INTERVAL, progress=False)

    if df.empty:
        print(f"  ! No data returned for {ticker} — check the ticker symbol.")
        return None

    # yfinance sometimes returns multi-level columns — flatten them
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.reset_index()  # make 'Date' a normal column instead of the index

    # Keep only the columns we actually need
    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]]

    # Drop any rows with missing values (holidays, bad data, etc.)
    df = df.dropna()

    # Add daily % return — Person 2 will need this for the price-anomaly z-score
    df["Daily_Return_%"] = df["Close"].pct_change() * 100

    # First row will have NaN return (nothing to compare to) — drop it
    df = df.dropna().reset_index(drop=True)

    return df


def main():
    summary = []

    for ticker in WATCHLIST:
        print(f"Fetching {ticker} ...")
        df = fetch_stock(ticker)

        if df is None:
            summary.append((ticker, "FAILED"))
            continue

        out_path = os.path.join(OUT_DIR, f"{ticker.replace('.NS', '')}.csv")
        df.to_csv(out_path, index=False)
        summary.append((ticker, f"OK ({len(df)} rows) -> {out_path}"))

    # ---- Print a summary so you can see what worked ----
    print("\n--- Summary ---")
    for ticker, status in summary:
        print(f"{ticker:15s} {status}")


if __name__ == "__main__":
    main()
