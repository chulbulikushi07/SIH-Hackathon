"""
Anomaly Detection for Unusual Trading Patterns
SIH 2026 - Person 2's statistics / scoring module.

Input:
    DataFrame with Date, Close, Volume for one stock.

Output:
    Full scored DataFrame plus a clean anomaly summary.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def add_rolling_stats(df: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    out = df.copy()
    out["daily_return"] = out["Close"].pct_change()

    # Exclude today's value from today's baseline to avoid leakage.
    out["ret_roll_mean"] = out["daily_return"].shift(1).rolling(window).mean()
    out["ret_roll_std"] = out["daily_return"].shift(1).rolling(window).std()

    out["vol_roll_mean"] = out["Volume"].shift(1).rolling(window).mean()
    out["vol_roll_std"] = out["Volume"].shift(1).rolling(window).std()
    return out


def add_zscores(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    ret_std = out["ret_roll_std"].replace(0, np.nan)
    vol_std = out["vol_roll_std"].replace(0, np.nan)

    out["z_return"] = (out["daily_return"] - out["ret_roll_mean"]) / ret_std
    out["z_volume"] = (out["Volume"] - out["vol_roll_mean"]) / vol_std
    return out


def flag_anomalies(df: pd.DataFrame, threshold: float = 2.5) -> pd.DataFrame:
    out = df.copy()
    out["flag_return"] = out["z_return"].abs() > threshold
    out["flag_volume"] = out["z_volume"].abs() > threshold
    out["flag_any"] = out["flag_return"] | out["flag_volume"]
    return out


def what_triggered(row: pd.Series) -> str:
    if row["flag_return"] and row["flag_volume"]:
        return "price & volume"
    if row["flag_return"]:
        return "price"
    if row["flag_volume"]:
        return "volume"
    return ""


def score_stock(
    df: pd.DataFrame,
    ticker: str,
    window: int = 20,
    threshold: float = 2.5,
) -> pd.DataFrame:
    required = {"Date", "Close", "Volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{ticker}: missing columns {sorted(missing)}")

    clean = df[["Date", "Close", "Volume"]].copy()
    clean["Date"] = pd.to_datetime(clean["Date"])
    clean = clean.sort_values("Date").dropna().reset_index(drop=True)

    scored = add_rolling_stats(clean, window=window)
    scored = add_zscores(scored)
    scored = flag_anomalies(scored, threshold=threshold)
    scored["Stock"] = ticker
    return scored


def build_flag_summary(scored: pd.DataFrame) -> pd.DataFrame:
    flagged = scored[scored["flag_any"]].copy()
    if flagged.empty:
        return pd.DataFrame(
            columns=["date", "stock", "flagged_metric", "z_return", "z_volume"]
        )

    flagged["flagged_metric"] = flagged.apply(what_triggered, axis=1)
    summary = flagged[
        ["Date", "Stock", "flagged_metric", "z_return", "z_volume"]
    ].rename(columns={"Date": "date", "Stock": "stock"})

    summary["z_return"] = summary["z_return"].round(2)
    summary["z_volume"] = summary["z_volume"].round(2)
    return summary.sort_values("date").reset_index(drop=True)


def run_screener(
    stock_data: dict[str, pd.DataFrame],
    window: int = 20,
    threshold: float = 2.5,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    scored_frames = [
        score_stock(df, ticker, window=window, threshold=threshold)
        for ticker, df in stock_data.items()
    ]

    if not scored_frames:
        empty = pd.DataFrame()
        return empty, pd.DataFrame(
            columns=["date", "stock", "flagged_metric", "z_return", "z_volume"]
        )

    all_scored = pd.concat(scored_frames, ignore_index=True)
    return all_scored, build_flag_summary(all_scored)


def flag_rate_by_threshold(
    all_scored: pd.DataFrame,
    thresholds=(1.5, 2.0, 2.5, 3.0, 3.5),
) -> pd.DataFrame:
    rows = []
    valid = all_scored.dropna(subset=["z_return", "z_volume"])
    n = len(valid)

    for threshold in thresholds:
        flagged = (
            (valid["z_return"].abs() > threshold)
            | (valid["z_volume"].abs() > threshold)
        ).sum()
        rows.append(
            {
                "threshold": threshold,
                "days_flagged": int(flagged),
                "pct_flagged": round(100 * flagged / n, 2) if n else 0,
            }
        )
    return pd.DataFrame(rows)
