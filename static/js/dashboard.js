const selector = document.getElementById("stockSelector");

async function loadStocks() {

    const response = await fetch("/api/stocks");
    const stocks = await response.json();

    stocks.forEach(stock => {

        const option = document.createElement("option");

        option.value = stock;
        option.textContent = stock;

        selector.appendChild(option);

    });

    loadStock(stocks[0]);
}


async function loadStock(ticker) {

    const response = await fetch(`/api/stock/${ticker}`);
    const data = await response.json();

    document.getElementById("currentPrice").textContent =
        `₹${data.current_price}`;

    document.getElementById("anomalyCount").textContent =
        data.anomaly_count;

    document.getElementById("status").textContent =
        data.anomaly_count > 0 ? "⚠ Anomalies Detected" : "Normal";

    createPriceChart(data);
    createVolumeChart(data);
    createAnomalyTable(data);
}


function createPriceChart(data) {

    const anomalyDates = data.anomalies
        .filter(a => a.metric === "Price Return")
        .map(a => a.date);

    const anomalyPrices = anomalyDates.map(date => {
        const index = data.dates.indexOf(date);
        return data.prices[index];
    });

    const priceTrace = {
        x: data.dates,
        y: data.prices,
        type: "scatter",
        mode: "lines",
        name: "Price"
    };

    const anomalyTrace = {
        x: anomalyDates,
        y: anomalyPrices,
        type: "scatter",
        mode: "markers",
        name: "Anomaly",
        marker: {
            size: 12
        }
    };

    Plotly.newPlot(
        "priceChart",
        [priceTrace, anomalyTrace],
        {
            xaxis: {
                title: "Date"
            },
            yaxis: {
                title: "Price (₹)"
            }
        }
    );
}


function createVolumeChart(data) {

    const volumeTrace = {
        x: data.dates,
        y: data.volumes,
        type: "bar",
        name: "Volume"
    };

    Plotly.newPlot(
        "volumeChart",
        [volumeTrace],
        {
            xaxis: {
                title: "Date"
            },
            yaxis: {
                title: "Volume"
            }
        }
    );
}


function createAnomalyTable(data) {

    const table = document.getElementById("anomalyTable");

    table.innerHTML = "";

    data.anomalies.forEach(anomaly => {

        const row = `
            <tr>
                <td>${anomaly.date}</td>
                <td>${anomaly.metric}</td>
                <td>
                    <span class="badge text-bg-danger">
                        ${anomaly.z_score}
                    </span>
                </td>
            </tr>
        `;

        table.innerHTML += row;

    });
}


selector.addEventListener("change", () => {
    loadStock(selector.value);
});


loadStocks();