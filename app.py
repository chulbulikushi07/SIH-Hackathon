from flask import Flask, render_template, jsonify
import json

app = Flask(__name__)


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/stocks")
def stocks():
    with open("data/mock_data.json") as file:
        data = json.load(file)

    return jsonify(list(data.keys()))


@app.route("/api/stock/<ticker>")
def stock_data(ticker):
    with open("data/mock_data.json") as file:
        data = json.load(file)

    if ticker not in data:
        return jsonify({"error": "Stock not found"}), 404

    return jsonify(data[ticker])


if __name__ == "__main__":
    app.run(debug=True)