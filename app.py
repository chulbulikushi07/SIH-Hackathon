from flask import Flask, render_template, jsonify, request
import os
import glob
import pandas as pd

from anomaly_detector import score_stock

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# Names are only presentation metadata. Detection itself uses the CSV data.
STOCK_NAMES = {
    "RELIANCE": "Reliance Industries Ltd",
    "TCS": "Tata Consultancy Services Ltd",
    "HDFCBANK": "HDFC Bank Ltd",
    "INFY": "Infosys Ltd",
    "ITC": "ITC Ltd",
    "IRCTC": "Indian Railway Catering & Tourism Corp",
    "ETERNAL": "Eternal Ltd",
    "IDEA": "Vodafone Idea Ltd",
    "YESBANK": "Yes Bank Ltd",
    "SUZLON": "Suzlon Energy Ltd",
    "RTNPOWER": "RattanIndia Power Ltd",
    "GTLINFRA": "GTL Infrastructure Ltd",
    "JPPOWER": "Jaiprakash Power Ventures Ltd",
    "TRIDENT": "Trident Ltd",
    "SOUTHBANK": "South Indian Bank Ltd",
    "SADBHAV": "Sadbhav Engineering Ltd",
    "RPOWER": "Reliance Power Ltd",
    "PCJEWELLER": "PC Jeweller Ltd",
}


def _severity(z):
    az = abs(float(z))
    if az >= 4:
        return "CRITICAL"
    if az >= 3:
        return "HIGH"
    if az >= 2.5:
        return "MEDIUM"
    return "NORMAL"


def _ticker_from_symbol(symbol):
    symbol = symbol.upper().replace(".NS", "")
    # Keep compatibility with the old dashboard's HDFC label.
    if symbol == "HDFC":
        symbol = "HDFCBANK"
    return symbol


def _csv_path(symbol):
    return os.path.join(DATA_DIR, f"{_ticker_from_symbol(symbol)}.csv")


def _load_stock(symbol):
    symbol = _ticker_from_symbol(symbol)
    path = _csv_path(symbol)

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No data file for {symbol}. Run `python fetch_data.py` first."
        )

    df = pd.read_csv(path, parse_dates=["Date"])
    return symbol, df


def _scan_stock(symbol, window=30, threshold=2.5,
                check_price=True, check_volume=True):
    symbol, df = _load_stock(symbol)
    scored = score_stock(df, symbol, window=window, threshold=threshold)

    # Keep the dashboard's selected time range while preserving enough history
    # for the rolling calculation.
    chart = scored.tail(window).copy()

    anomalies = []
    for _, row in chart[chart["flag_any"]].iterrows():
        if check_price and bool(row["flag_return"]):
            z = float(row["z_return"])
            expected_return = row["ret_roll_mean"]
            expected_price = (
                float(row["Close"]) / (1 + z * 0)  # keep observed price unchanged
            )
            # Expected price is a simple baseline: yesterday's close adjusted by
            # the rolling mean return.
            prev_close = (
                chart.loc[chart.index < row.name, "Close"].iloc[-1]
                if (chart.index < row.name).any()
                else float(row["Close"])
            )
            if pd.notna(expected_return):
                expected_price = float(prev_close * (1 + expected_return))

            anomalies.append({
                "date": row["Date"].strftime("%Y-%m-%d"),
                "time": "—",
                "metric": "PRICE",
                "z_score": round(z, 2),
                "severity": _severity(z),
                "status": "UNEXPLAINED",
                "observed": round(float(row["Close"]), 2),
                "expected": round(expected_price, 2),
                "context": "Price-return anomaly detected by rolling z-score.",
            })

        if check_volume and bool(row["flag_volume"]):
            z = float(row["z_volume"])
            anomalies.append({
                "date": row["Date"].strftime("%Y-%m-%d"),
                "time": "—",
                "metric": "VOLUME",
                "z_score": round(z, 2),
                "severity": _severity(z),
                "status": "UNEXPLAINED",
                "observed": int(row["Volume"]),
                "expected": round(float(row["vol_roll_mean"]), 0),
                "context": "Volume anomaly detected by rolling z-score.",
            })

    anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)

    prices = [round(float(x), 2) for x in chart["Close"]]
    volumes = [int(x) for x in chart["Volume"]]
    dates = [x.strftime("%Y-%m-%d") for x in chart["Date"]]

    price_change = (
        (prices[-1] - prices[-2]) / prices[-2] * 100
        if len(prices) >= 2 and prices[-2]
        else 0
    )

    return {
        "symbol": symbol,
        "name": STOCK_NAMES.get(symbol, symbol),
        "current_price": prices[-1] if prices else None,
        "price_change": round(price_change, 2),
        "volume_today": volumes[-1] if volumes else None,
        "anomaly_count": len(anomalies),
        "risk_level": (
            "CRITICAL" if any(a["severity"] == "CRITICAL" for a in anomalies)
            else "HIGH" if any(a["severity"] == "HIGH" for a in anomalies)
            else "MEDIUM" if anomalies else "LOW"
        ),
        "threshold": threshold,
        "dates": dates,
        "prices": prices,
        "volumes": volumes,
        "z_scores": {
            "price": [
                round(float(x), 4) if pd.notna(x) else None
                for x in chart["z_return"]
            ],
            "volume": [
                round(float(x), 4) if pd.notna(x) else None
                for x in chart["z_volume"]
            ],
        },
        "anomalies": anomalies,
    }


def _available_symbols():
    return sorted(
        os.path.splitext(os.path.basename(p))[0].upper()
        for p in glob.glob(os.path.join(DATA_DIR, "*.csv"))
        if not os.path.basename(p).endswith("_chart.csv")
    )


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/stocks")
def api_stocks():
    result = []
    for symbol in _available_symbols():
        try:
            data = _scan_stock(symbol)
            result.append({
                "symbol": data["symbol"],
                "name": data["name"],
                "current_price": data["current_price"],
                "price_change": data["price_change"],
                "anomaly_count": data["anomaly_count"],
                "risk_level": data["risk_level"],
            })
        except Exception as exc:
            print(f"Skipping {symbol}: {exc}")
    return jsonify(result)


@app.route("/api/market")
def api_market():
    # Market index values are not part of Person 2's anomaly engine.
    # Keep a neutral status response until a market-index feed is added.
    return jsonify({
        "nifty50": 0,
        "nifty50_change": 0,
        "sensex": 0,
        "sensex_change": 0,
        "status": "DATA LINKED",
    })


@app.route("/api/stock/<ticker>")
def api_stock(ticker):
    try:
        return jsonify(_scan_stock(ticker))
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/anomalies")
def api_anomalies():
    all_anomalies = []
    for symbol in _available_symbols():
        try:
            stock = _scan_stock(symbol)
            for anomaly in stock["anomalies"]:
                entry = dict(anomaly)
                entry["symbol"] = symbol
                all_anomalies.append(entry)
        except Exception as exc:
            print(f"Could not scan {symbol}: {exc}")

    all_anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
    return jsonify(all_anomalies)


@app.route("/api/scan", methods=["POST"])
def api_scan():
    params = request.get_json(silent=True) or {}
    symbol = params.get("symbol", "").upper()
    window = max(7, int(params.get("window", 30)))
    threshold = float(params.get("threshold", 2.5))
    check_price = bool(params.get("check_price", True))
    check_volume = bool(params.get("check_volume", True))

    if symbol:
        try:
            return jsonify(
                _scan_stock(
                    symbol, window, threshold, check_price, check_volume
                )
            )
        except FileNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404

    results = {}
    for ticker in _available_symbols():
        try:
            results[ticker] = _scan_stock(
                ticker, window, threshold, check_price, check_volume
            )
        except Exception as exc:
            print(f"Scan failed for {ticker}: {exc}")

    return jsonify(results)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=True,
    )
