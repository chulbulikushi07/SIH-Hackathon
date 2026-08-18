from flask import Flask, render_template, jsonify, request
import json
import copy

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Data layer — isolated so it can be swapped for a real detection engine later
# ---------------------------------------------------------------------------

def _load_data():
    """Load the mock data file. Replace this function when connecting real data."""
    with open("data/mock_data.json") as f:
        return json.load(f)


def _compute_severity(z):
    """Map |z-score| to a severity label."""
    az = abs(z)
    if az >= 4.0:
        return "CRITICAL"
    if az >= 3.0:
        return "HIGH"
    if az >= 2.5:
        return "MEDIUM"
    return "NORMAL"


def _run_scan(stock, window=30, threshold=2.5, check_price=True, check_volume=True):
    """
    Re-scan a stock's z-score arrays and regenerate anomalies.
    Uses the mock z-score values but applies the user-supplied threshold.
    In production this would call the actual rolling-statistics engine.
    """
    stock = copy.deepcopy(stock)
    anomalies = []
    dates = stock["dates"][-window:]
    offset = len(stock["dates"]) - len(dates)

    if check_price:
        zp = stock["z_scores"]["price"]
        for i, d in enumerate(dates):
            idx = i + offset
            z = zp[idx]
            if abs(z) >= threshold:
                anomalies.append({
                    "date": d,
                    "time": "—",
                    "metric": "PRICE",
                    "z_score": round(z, 2),
                    "severity": _compute_severity(z),
                    "status": "UNEXPLAINED",
                    "observed": stock["prices"][idx],
                    "expected": round(sum(stock["prices"][max(0, idx-5):idx]) / max(1, min(5, idx)), 2),
                    "context": "Detected by scan — pending investigation."
                })

    if check_volume:
        zv = stock["z_scores"]["volume"]
        for i, d in enumerate(dates):
            idx = i + offset
            z = zv[idx]
            if abs(z) >= threshold:
                anomalies.append({
                    "date": d,
                    "time": "—",
                    "metric": "VOLUME",
                    "z_score": round(z, 2),
                    "severity": _compute_severity(z),
                    "status": "UNEXPLAINED",
                    "observed": stock["volumes"][idx],
                    "expected": round(sum(stock["volumes"][max(0, idx-5):idx]) / max(1, min(5, idx)), 2),
                    "context": "Detected by scan — pending investigation."
                })

    # Sort by |z| descending
    anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
    stock["anomalies"] = anomalies
    stock["anomaly_count"] = len(anomalies)
    stock["risk_level"] = (
        "CRITICAL" if any(a["severity"] == "CRITICAL" for a in anomalies) else
        "HIGH" if any(a["severity"] == "HIGH" for a in anomalies) else
        "MEDIUM" if anomalies else
        "LOW"
    )
    stock["threshold"] = threshold
    return stock


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/stocks")
def api_stocks():
    """Return list of all tracked stock symbols with summary info."""
    data = _load_data()
    result = []
    for sym, stock in data["stocks"].items():
        result.append({
            "symbol": sym,
            "name": stock.get("name", sym),
            "current_price": stock["current_price"],
            "price_change": stock["price_change"],
            "anomaly_count": stock["anomaly_count"],
            "risk_level": stock["risk_level"]
        })
    return jsonify(result)


@app.route("/api/market")
def api_market():
    """Return market-level summary (indices, status)."""
    data = _load_data()
    return jsonify(data["market"])


@app.route("/api/stock/<ticker>")
def api_stock(ticker):
    """Return full data for a single stock."""
    data = _load_data()
    ticker = ticker.upper()
    if ticker not in data["stocks"]:
        return jsonify({"error": "Stock not found"}), 404
    return jsonify(data["stocks"][ticker])


@app.route("/api/anomalies")
def api_anomalies():
    """Return all anomalies across all stocks, sorted by severity."""
    data = _load_data()
    all_anomalies = []
    for sym, stock in data["stocks"].items():
        for a in stock["anomalies"]:
            entry = dict(a)
            entry["symbol"] = sym
            all_anomalies.append(entry)
    all_anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
    return jsonify(all_anomalies)


@app.route("/api/scan", methods=["POST"])
def api_scan():
    """
    Run anomaly scan with configurable parameters.
    Accepts JSON body: { symbol, window, threshold, check_price, check_volume }
    """
    params = request.get_json(silent=True) or {}
    symbol = params.get("symbol", "").upper()
    window = int(params.get("window", 30))
    threshold = float(params.get("threshold", 2.5))
    check_price = bool(params.get("check_price", True))
    check_volume = bool(params.get("check_volume", True))

    data = _load_data()
    if symbol and symbol in data["stocks"]:
        result = _run_scan(data["stocks"][symbol], window, threshold, check_price, check_volume)
        return jsonify(result)

    # Scan all stocks
    results = {}
    for sym, stock in data["stocks"].items():
        results[sym] = _run_scan(stock, window, threshold, check_price, check_volume)
    return jsonify(results)


if __name__ == "__main__":
    app.run(debug=True)