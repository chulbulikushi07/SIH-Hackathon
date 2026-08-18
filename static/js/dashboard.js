/* ═══════════════════════════════════════════════════════════════════
   TERMINAL NOIR — Dashboard Controller
   Anomaly Watch / NSE Market Surveillance
   ═══════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────
let activeSymbol = null;
let stocksList = [];
let allAnomalies = [];
let currentThreshold = 2.5;

// ── Plotly dark layout base ────────────────────────────────────────
const COLORS = {
    orange: '#F59E0B',
    teal:   '#22C7B8',
    red:    '#FF453A',
    green:  '#35D07F',
    bg:     '#0D1013',
    grid:   '#1C2024',
    text:   '#7C858D',
    line:   '#252A2E'
};

function plotLayout(overrides = {}) {
    return Object.assign({
        paper_bgcolor: COLORS.bg,
        plot_bgcolor:  COLORS.bg,
        margin: { t: 8, r: 12, b: 32, l: 48 },
        font: {
            family: "'JetBrains Mono', monospace",
            size: 10,
            color: COLORS.text
        },
        xaxis: {
            gridcolor: COLORS.grid,
            linecolor: COLORS.line,
            zerolinecolor: COLORS.grid,
            tickfont: { size: 9 }
        },
        yaxis: {
            gridcolor: COLORS.grid,
            linecolor: COLORS.line,
            zerolinecolor: COLORS.grid,
            tickfont: { size: 9 }
        },
        showlegend: false
    }, overrides);
}

const PLOT_CONFIG = {
    displayModeBar: false,
    responsive: true
};

// ── Helpers ────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function fmtVol(n) {
    if (n == null) return '—';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + 'L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function severityClass(sev) {
    return (sev || '').toLowerCase();
}

function statusClass(st) {
    return (st || '').toLowerCase();
}

// ── Clock ──────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(v => String(v).padStart(2, '0')).join(':');
    const el = document.getElementById('statusClock');
    if (el) el.textContent = ts;
}
setInterval(updateClock, 1000);
updateClock();

// ── API calls ──────────────────────────────────────────────────────
async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ── Load market data (header) ──────────────────────────────────────
async function loadMarket() {
    try {
        const m = await fetchJSON('/api/market');
        document.getElementById('niftyValue').textContent = fmt(m.nifty50);
        const nc = document.getElementById('niftyChange');
        nc.textContent = (m.nifty50_change >= 0 ? '+' : '') + fmt(m.nifty50_change) + '%';
        nc.className = 'index-change mono ' + (m.nifty50_change >= 0 ? 'positive' : 'negative');

        document.getElementById('sensexValue').textContent = fmt(m.sensex);
        const sc = document.getElementById('sensexChange');
        sc.textContent = (m.sensex_change >= 0 ? '+' : '') + fmt(m.sensex_change) + '%';
        sc.className = 'index-change mono ' + (m.sensex_change >= 0 ? 'positive' : 'negative');
    } catch (e) {
        console.error('Failed to load market data:', e);
    }
}

// ── Load stocks list (sidebar + ticker + config dropdown) ──────────
async function loadStocks() {
    try {
        stocksList = await fetchJSON('/api/stocks');
        renderWatchlist();
        renderTicker();
        renderConfigDropdown();
        renderSidebarAlerts();

        // Count total anomalies for badge
        let totalAnomalies = 0;
        stocksList.forEach(s => { totalAnomalies += s.anomaly_count; });
        const badge = document.getElementById('alertBadge');
        if (badge) badge.textContent = totalAnomalies;

        // Select first stock
        if (stocksList.length > 0 && !activeSymbol) {
            selectStock(stocksList[0].symbol);
        }
    } catch (e) {
        console.error('Failed to load stocks:', e);
    }
}

// ── Render watchlist ───────────────────────────────────────────────
function renderWatchlist() {
    const el = document.getElementById('watchlist');
    if (!el) return;
    el.innerHTML = '';
    stocksList.forEach(s => {
        const item = document.createElement('div');
        item.className = 'watchlist-item' + (s.symbol === activeSymbol ? ' active' : '');
        const chgClass = s.price_change >= 0 ? 'positive' : 'negative';
        const chgSign = s.price_change >= 0 ? '+' : '';
        item.innerHTML = `
            <span class="wl-dot risk-${s.risk_level}"></span>
            <span class="wl-symbol">${s.symbol}</span>
            <span class="wl-change ${chgClass}">${chgSign}${fmt(s.price_change)}%</span>
        `;
        item.addEventListener('click', () => selectStock(s.symbol));
        el.appendChild(item);
    });
}

// ── Render ticker strip ────────────────────────────────────────────
function renderTicker() {
    const el = document.getElementById('tickerStrip');
    if (!el) return;
    el.innerHTML = '';
    stocksList.forEach(s => {
        const chgClass = s.price_change >= 0 ? 'positive' : 'negative';
        const chgSign = s.price_change >= 0 ? '+' : '';
        const item = document.createElement('div');
        item.className = 'ticker-item';
        item.innerHTML = `
            <span class="ticker-sym">${s.symbol}</span>
            <span class="ticker-chg ${chgClass}">${chgSign}${fmt(s.price_change)}%</span>
        `;
        item.addEventListener('click', () => selectStock(s.symbol));
        el.appendChild(item);
    });
}

// ── Sidebar alerts ─────────────────────────────────────────────────
function renderSidebarAlerts() {
    const el = document.getElementById('sidebarAlerts');
    if (!el) return;
    el.innerHTML = '';
    stocksList.filter(s => s.anomaly_count > 0).forEach(s => {
        const alert = document.createElement('div');
        alert.className = 'sidebar-alert';
        alert.innerHTML = `
            <span class="alert-sev ${severityClass(s.risk_level)}">${s.risk_level}</span>
            <span>${s.symbol}</span>
            <span style="margin-left:auto;">${s.anomaly_count}</span>
        `;
        alert.addEventListener('click', () => selectStock(s.symbol));
        el.appendChild(alert);
    });
}

// ── Config dropdown ────────────────────────────────────────────────
function renderConfigDropdown() {
    const sel = document.getElementById('cfgSymbol');
    if (!sel) return;
    // Keep the "ALL STOCKS" option
    sel.innerHTML = '<option value="">ALL STOCKS</option>';
    stocksList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.symbol;
        opt.textContent = s.symbol;
        sel.appendChild(opt);
    });
}

// ── Select stock ───────────────────────────────────────────────────
async function selectStock(symbol) {
    activeSymbol = symbol;
    renderWatchlist();

    try {
        const data = await fetchJSON(`/api/stock/${symbol}`);
        renderMetrics(data);
        renderPriceChart(data);
        renderVolumeChart(data);
        renderZScoreChart(data);
        renderAnomalyTable(data);
    } catch (e) {
        console.error('Failed to load stock:', e);
    }
}

// ── Render metrics ─────────────────────────────────────────────────
function renderMetrics(data) {
    document.getElementById('activeSymbol').textContent = data.symbol;
    document.getElementById('activeName').textContent = data.name || data.symbol;

    const badge = document.getElementById('riskBadge');
    badge.textContent = data.risk_level;
    badge.className = 'risk-badge risk-' + data.risk_level;

    const priceEl = document.getElementById('metricPrice');
    priceEl.textContent = '₹' + fmt(data.current_price);

    const changeEl = document.getElementById('metricChange');
    const chgSign = data.price_change >= 0 ? '+' : '';
    changeEl.textContent = chgSign + fmt(data.price_change) + '%';
    changeEl.className = 'metric-value mono ' + (data.price_change >= 0 ? 'positive' : 'negative');

    document.getElementById('metricVolume').textContent = fmtVol(data.volume_today);

    const anomEl = document.getElementById('metricAnomalies');
    anomEl.textContent = String(data.anomaly_count).padStart(2, '0');
    if (data.anomaly_count > 0) anomEl.style.color = COLORS.red;
    else anomEl.style.color = '';

    document.getElementById('metricThreshold').textContent = '|Z| > ' + data.threshold + 'σ';
}

// ── Price chart ────────────────────────────────────────────────────
function renderPriceChart(data) {
    const anomalyDates = data.anomalies
        .filter(a => a.metric === 'PRICE' || a.metric === 'Price Return')
        .map(a => a.date);
    const anomalyPrices = anomalyDates.map(d => {
        const idx = data.dates.indexOf(d);
        return idx >= 0 ? data.prices[idx] : null;
    });

    const traces = [
        {
            x: data.dates,
            y: data.prices,
            type: 'scatter',
            mode: 'lines',
            line: { color: COLORS.orange, width: 1.5 },
            hovertemplate: '₹%{y:.2f}<br>%{x}<extra></extra>'
        }
    ];

    if (anomalyDates.length > 0) {
        traces.push({
            x: anomalyDates,
            y: anomalyPrices,
            type: 'scatter',
            mode: 'markers',
            marker: {
                color: COLORS.red,
                size: 8,
                symbol: 'circle',
                line: { color: COLORS.red, width: 1 }
            },
            hovertemplate: 'ANOMALY<br>₹%{y:.2f}<br>%{x}<extra></extra>'
        });
    }

    Plotly.newPlot('priceChart', traces, plotLayout({
        yaxis: {
            gridcolor: COLORS.grid,
            linecolor: COLORS.line,
            zerolinecolor: COLORS.grid,
            tickfont: { size: 9 },
            tickprefix: '₹'
        }
    }), PLOT_CONFIG);
}

// ── Volume chart ───────────────────────────────────────────────────
function renderVolumeChart(data) {
    // Color bars: highlight anomaly dates
    const anomalyDates = new Set(
        data.anomalies
            .filter(a => a.metric === 'VOLUME' || a.metric === 'Volume')
            .map(a => a.date)
    );

    const barColors = data.dates.map(d =>
        anomalyDates.has(d) ? COLORS.red : COLORS.teal
    );

    const traces = [{
        x: data.dates,
        y: data.volumes,
        type: 'bar',
        marker: { color: barColors, opacity: 0.8 },
        hovertemplate: '%{y:,.0f}<br>%{x}<extra></extra>'
    }];

    Plotly.newPlot('volumeChart', traces, plotLayout(), PLOT_CONFIG);
}

// ── Z-Score chart ──────────────────────────────────────────────────
function renderZScoreChart(data) {
    const threshold = data.threshold || 2.5;
    currentThreshold = threshold;

    const traces = [];

    // Price z-score line
    if (data.z_scores && data.z_scores.price) {
        traces.push({
            x: data.dates,
            y: data.z_scores.price,
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Price Z',
            line: { color: COLORS.orange, width: 1.2 },
            marker: {
                size: data.z_scores.price.map(z => Math.abs(z) >= threshold ? 8 : 3),
                color: data.z_scores.price.map(z =>
                    Math.abs(z) >= 4 ? COLORS.red :
                    Math.abs(z) >= 3 ? COLORS.orange :
                    Math.abs(z) >= threshold ? '#FACC15' :
                    COLORS.orange
                ),
                opacity: data.z_scores.price.map(z => Math.abs(z) >= threshold ? 1 : 0.5)
            },
            hovertemplate: 'Price Z: %{y:.2f}σ<br>%{x}<extra></extra>'
        });
    }

    // Volume z-score line
    if (data.z_scores && data.z_scores.volume) {
        traces.push({
            x: data.dates,
            y: data.z_scores.volume,
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Volume Z',
            line: { color: COLORS.teal, width: 1.2 },
            marker: {
                size: data.z_scores.volume.map(z => Math.abs(z) >= threshold ? 8 : 3),
                color: data.z_scores.volume.map(z =>
                    Math.abs(z) >= 4 ? COLORS.red :
                    Math.abs(z) >= 3 ? COLORS.orange :
                    Math.abs(z) >= threshold ? '#FACC15' :
                    COLORS.teal
                ),
                opacity: data.z_scores.volume.map(z => Math.abs(z) >= threshold ? 1 : 0.5)
            },
            hovertemplate: 'Volume Z: %{y:.2f}σ<br>%{x}<extra></extra>'
        });
    }

    // Threshold lines
    const thresholdLine = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [threshold, threshold],
        type: 'scatter',
        mode: 'lines',
        line: { color: COLORS.red, width: 1, dash: 'dash' },
        hoverinfo: 'skip'
    };

    const thresholdLineNeg = {
        x: [data.dates[0], data.dates[data.dates.length - 1]],
        y: [-threshold, -threshold],
        type: 'scatter',
        mode: 'lines',
        line: { color: COLORS.red, width: 1, dash: 'dash' },
        hoverinfo: 'skip'
    };

    traces.push(thresholdLine, thresholdLineNeg);

    // Threshold fill
    const fillAbove = {
        x: [data.dates[0], data.dates[data.dates.length - 1], data.dates[data.dates.length - 1], data.dates[0]],
        y: [threshold, threshold, 8, 8],
        fill: 'toself',
        fillcolor: 'rgba(255, 69, 58, 0.06)',
        type: 'scatter',
        mode: 'none',
        hoverinfo: 'skip'
    };

    traces.push(fillAbove);

    // Annotations
    const layout = plotLayout({
        showlegend: true,
        legend: {
            x: 1, y: 1,
            xanchor: 'right',
            bgcolor: 'rgba(0,0,0,0)',
            font: { size: 9, color: COLORS.text }
        },
        yaxis: {
            gridcolor: COLORS.grid,
            linecolor: COLORS.line,
            zerolinecolor: COLORS.line,
            tickfont: { size: 9 },
            ticksuffix: 'σ'
        },
        annotations: [{
            x: data.dates[data.dates.length - 1],
            y: threshold,
            text: threshold + 'σ',
            showarrow: false,
            font: { size: 9, color: COLORS.red },
            xanchor: 'left',
            xshift: 4
        }]
    });

    document.getElementById('chartThresholdLabel').textContent = threshold;

    Plotly.newPlot('zscoreChart', traces, layout, PLOT_CONFIG);
}

// ── Anomaly table ──────────────────────────────────────────────────
function renderAnomalyTable(data) {
    const tbody = document.getElementById('anomalyTableBody');
    const countEl = document.getElementById('eventCount');
    const emptyEl = document.getElementById('tableEmpty');
    if (!tbody) return;

    const anomalies = data.anomalies || [];
    countEl.textContent = anomalies.length;

    if (anomalies.length === 0) {
        tbody.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';
    tbody.innerHTML = '';

    anomalies.forEach(a => {
        const tr = document.createElement('tr');
        tr.className = 'anomaly-row';
        const sevCls = severityClass(a.severity);
        const stCls = statusClass(a.status);
        const zCls =
            Math.abs(a.z_score) >= 4 ? 'critical' :
            Math.abs(a.z_score) >= 3 ? 'high' : 'medium';

        tr.innerHTML = `
            <td>${a.time || a.date}</td>
            <td>${data.symbol}</td>
            <td><span class="signal-${a.metric.toLowerCase()}">${a.metric}</span></td>
            <td><span class="z-val ${zCls}">${a.z_score >= 0 ? '+' : ''}${fmt(a.z_score)}σ</span></td>
            <td><span class="sev-chip ${sevCls}">${a.severity}</span></td>
            <td><span class="status-chip ${stCls}">${a.status}</span></td>
        `;
        tr.addEventListener('click', () => openInvestigation(a, data));
        tbody.appendChild(tr);
    });
}

// ── Investigation panel ────────────────────────────────────────────
function openInvestigation(anomaly, stockData) {
    const overlay = document.getElementById('investigationOverlay');
    const body = document.getElementById('invBody');
    if (!overlay || !body) return;

    const sevCls = severityClass(anomaly.severity);
    const stCls = statusClass(anomaly.status);
    const zCls =
        Math.abs(anomaly.z_score) >= 4 ? 'critical' :
        Math.abs(anomaly.z_score) >= 3 ? 'high' : 'medium';

    // Determine workflow step
    const steps = ['MARKET', 'SIGNAL', 'ALERT', 'INVESTIGATION', 'EXPLANATION'];
    let activeStep = 3; // INVESTIGATION
    if (anomaly.status === 'EXPLAINED') activeStep = 4;

    const stepsHTML = steps.map((s, i) => {
        let cls = '';
        if (i < activeStep) cls = 'done';
        else if (i === activeStep) cls = 'active';
        return `<div class="inv-step ${cls}">
            ${i > 0 ? '<span class="inv-step-arrow">↓</span>' : '<span style="width:14px;display:inline-block;"></span>'}
            ${s}
        </div>`;
    }).join('');

    body.innerHTML = `
        <div class="inv-field">
            <div class="inv-label">SYMBOL</div>
            <div class="inv-value large">${stockData.symbol}</div>
            <div style="color:var(--muted);font-size:11px;margin-top:2px;">${anomaly.metric} anomaly</div>
        </div>
        <div class="inv-divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="inv-field">
                <div class="inv-label">Z-SCORE</div>
                <div class="inv-value"><span class="z-val ${zCls}" style="font-size:20px;">${anomaly.z_score >= 0 ? '+' : ''}${fmt(anomaly.z_score)}σ</span></div>
            </div>
            <div class="inv-field">
                <div class="inv-label">SEVERITY</div>
                <div class="inv-value"><span class="sev-chip ${sevCls}" style="font-size:11px;">${anomaly.severity}</span></div>
            </div>
            <div class="inv-field">
                <div class="inv-label">OBSERVED</div>
                <div class="inv-value">${anomaly.metric === 'PRICE' ? '₹' + fmt(anomaly.observed) : fmtVol(anomaly.observed)}</div>
            </div>
            <div class="inv-field">
                <div class="inv-label">EXPECTED</div>
                <div class="inv-value">${anomaly.metric === 'PRICE' ? '₹' + fmt(anomaly.expected) : fmtVol(anomaly.expected)}</div>
            </div>
        </div>
        <div class="inv-field">
            <div class="inv-label">DATE</div>
            <div class="inv-value">${anomaly.date}${anomaly.time && anomaly.time !== '—' ? ' ' + anomaly.time : ''}</div>
        </div>
        <div class="inv-divider"></div>
        <div class="inv-field">
            <div class="inv-label">CONTEXT / EXPLANATION</div>
            <div class="inv-context">${anomaly.context || 'No context available.'}</div>
        </div>
        <div class="inv-field">
            <div class="inv-label">STATUS</div>
            <div class="inv-value"><span class="status-chip ${stCls}">${anomaly.status}</span></div>
        </div>
        <div class="inv-divider"></div>
        <div class="inv-field">
            <div class="inv-label">INVESTIGATION WORKFLOW</div>
            <div class="inv-workflow">${stepsHTML}</div>
        </div>
    `;

    overlay.classList.add('open');
}

function closeInvestigation() {
    const overlay = document.getElementById('investigationOverlay');
    if (overlay) overlay.classList.remove('open');
}

// ── Navigation ─────────────────────────────────────────────────────
function switchView(view) {
    const views = {
        overview: document.getElementById('viewOverview'),
        alerts: document.getElementById('viewAlerts'),
        config: document.getElementById('viewConfig')
    };

    Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
    if (views[view]) views[view].style.display = 'block';

    document.querySelectorAll('.sidebar-nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Load global anomalies for alerts view
    if (view === 'alerts') {
        loadGlobalAnomalies();
    }
}

// ── Global anomalies ───────────────────────────────────────────────
async function loadGlobalAnomalies() {
    try {
        const anomalies = await fetchJSON('/api/anomalies');
        const tbody = document.getElementById('globalAnomalyBody');
        const countEl = document.getElementById('globalEventCount');
        if (!tbody) return;

        countEl.textContent = anomalies.length;
        tbody.innerHTML = '';

        anomalies.forEach(a => {
            const tr = document.createElement('tr');
            const sevCls = severityClass(a.severity);
            const stCls = statusClass(a.status);
            const zCls =
                Math.abs(a.z_score) >= 4 ? 'critical' :
                Math.abs(a.z_score) >= 3 ? 'high' : 'medium';

            tr.innerHTML = `
                <td>${a.date}</td>
                <td>${a.symbol}</td>
                <td><span class="signal-${a.metric.toLowerCase()}">${a.metric}</span></td>
                <td><span class="z-val ${zCls}">${a.z_score >= 0 ? '+' : ''}${fmt(a.z_score)}σ</span></td>
                <td><span class="sev-chip ${sevCls}">${a.severity}</span></td>
                <td><span class="status-chip ${stCls}">${a.status}</span></td>
            `;
            tr.addEventListener('click', () => {
                // Find full stock data and open investigation
                fetchJSON(`/api/stock/${a.symbol}`).then(stockData => {
                    openInvestigation(a, stockData);
                });
            });
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Failed to load global anomalies:', e);
    }
}

// ── Scan ───────────────────────────────────────────────────────────
async function runScan() {
    const window_ = parseInt(document.getElementById('cfgWindow').value) || 30;
    const threshold = parseFloat(document.getElementById('cfgThreshold').value) || 2.5;
    const checkPrice = document.getElementById('cfgPrice').checked;
    const checkVolume = document.getElementById('cfgVolume').checked;
    const symbol = document.getElementById('cfgSymbol').value;
    const resultEl = document.getElementById('scanResult');

    resultEl.style.display = 'block';
    resultEl.textContent = 'SCANNING...';

    try {
        const result = await fetchJSON('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: symbol,
                window: window_,
                threshold: threshold,
                check_price: checkPrice,
                check_volume: checkVolume
            })
        });

        // Update status bar
        document.getElementById('statusWindow').textContent = window_ + 'D';
        document.getElementById('statusThreshold').textContent = '|Z| > ' + threshold + 'σ';

        if (symbol) {
            // Single stock result
            const count = result.anomaly_count || 0;
            resultEl.innerHTML = `SCAN COMPLETE — <span style="color:${count > 0 ? COLORS.red : COLORS.green}">${count} anomalies detected</span> for ${symbol} at threshold ${threshold}σ`;

            // Reload stock view if it's the active one
            if (symbol === activeSymbol) {
                renderMetrics(result);
                renderPriceChart(result);
                renderVolumeChart(result);
                renderZScoreChart(result);
                renderAnomalyTable(result);
            }
        } else {
            // All stocks result
            let total = 0;
            Object.values(result).forEach(s => { total += (s.anomaly_count || 0); });
            resultEl.innerHTML = `SCAN COMPLETE — <span style="color:${total > 0 ? COLORS.red : COLORS.green}">${total} anomalies detected</span> across all stocks at threshold ${threshold}σ`;
        }
    } catch (e) {
        resultEl.textContent = 'SCAN FAILED: ' + e.message;
        console.error('Scan failed:', e);
    }
}

// ── Event listeners ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Navigation buttons
    document.querySelectorAll('.sidebar-nav').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Investigation close
    const invClose = document.getElementById('invClose');
    if (invClose) invClose.addEventListener('click', closeInvestigation);

    const invOverlay = document.getElementById('investigationOverlay');
    if (invOverlay) {
        invOverlay.addEventListener('click', (e) => {
            if (e.target === invOverlay) closeInvestigation();
        });
    }

    // Scan button
    const scanBtn = document.getElementById('runScanBtn');
    if (scanBtn) scanBtn.addEventListener('click', runScan);

    // ESC to close investigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeInvestigation();
    });

    // Init
    loadMarket();
    loadStocks();
});