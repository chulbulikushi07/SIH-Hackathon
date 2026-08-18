import sys
import pandas as pd
import matplotlib.pyplot as plt

def plot_stock(ticker: str):
    path = f"data/{ticker}.csv"
    df = pd.read_csv(path, parse_dates=["Date"])

    fig, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True)

    axes[0].plot(df["Date"], df["Close"], color="steelblue")
    axes[0].set_title(f"{ticker} — Close Price")
    axes[0].set_ylabel("Price (INR)")

    axes[1].bar(df["Date"], df["Volume"], color="darkorange")
    axes[1].set_title(f"{ticker} — Volume")
    axes[1].set_ylabel("Shares Traded")

    plt.tight_layout()
    out_path = f"data/{ticker}_chart.png"
    plt.savefig(out_path)
    print(f"Saved chart to {out_path}")
    plt.show()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 plot_stock.py TICKER   (e.g. python3 plot_stock.py RTNPOWER)")
        sys.exit(1)

    plot_stock(sys.argv[1])
