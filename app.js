const MAX_POINTS = 25000;
const STORAGE_KEY = "icbc_ruyi_trend_points";
const API_ENDPOINTS = ["/api/quote.php"];

const refreshBtn = document.getElementById("refreshBtn");
const intervalSelect = document.getElementById("intervalSelect");
const rangeSelect = document.getElementById("rangeSelect");
const statusText = document.getElementById("statusText");
const buyPrice = document.getElementById("buyPrice");
const sellPrice = document.getElementById("sellPrice");
const quoteTime = document.getElementById("quoteTime");

const chart = echarts.init(document.getElementById("chart"));

let timer = null;
let points = loadPoints();

function loadPoints() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePoints() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
}

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function updateSummary() {
  const latest = points[points.length - 1];
  if (!latest) return;

  buyPrice.textContent = `${latest.buy.toFixed(2)}`;
  sellPrice.textContent = `${latest.sell.toFixed(2)}`;
  quoteTime.textContent = formatTime(latest.timestamp);
}

function updateChart() {
  const visible = getVisiblePoints();
  const xData = visible.map((item) => formatTime(item.timestamp));
  const buyData = visible.map((item) => item.buy);
  const sellData = visible.map((item) => item.sell);

  chart.setOption({
    tooltip: {
      trigger: "axis"
    },
    legend: {
      data: ["买入价", "卖出价"]
    },
    xAxis: {
      type: "category",
      data: xData,
      boundaryGap: false
    },
    yAxis: {
      type: "value",
      scale: true,
      name: "报价"
    },
    series: [
      {
        name: "买入价",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: buyData
      },
      {
        name: "卖出价",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: sellData
      }
    ]
  });
}

function getVisiblePoints() {
  const range = rangeSelect?.value || "24h";
  if (range === "all") {
    return points;
  }

  const latest = points[points.length - 1];
  if (!latest) {
    return [];
  }

  const latestTs = new Date(latest.timestamp).getTime();
  const rangeMsMap = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000
  };
  const span = rangeMsMap[range] ?? rangeMsMap["24h"];
  const minTs = latestTs - span;

  return points.filter((item) => new Date(item.timestamp).getTime() >= minTs);
}

async function fetchQuote() {
  statusText.textContent = "刷新中...";

  try {
    let response = null;

    for (const endpoint of API_ENDPOINTS) {
      response = await fetch(endpoint);
      if (response.ok) {
        break;
      }
    }

    if (!response || !response.ok) {
      throw new Error(`HTTP ${response ? response.status : "request failed"}`);
    }

    const data = await response.json();
    const quote = data.quote;

    points.push(quote);
    if (points.length > MAX_POINTS) {
      points = points.slice(points.length - MAX_POINTS);
    }

    savePoints();
    updateSummary();
    updateChart();
    statusText.textContent = `最新更新: ${formatTime(quote.timestamp)}`;
  } catch (error) {
    statusText.textContent = `刷新失败: ${error.message}`;
  }
}

function resetTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  const sec = Number(intervalSelect.value);
  if (sec > 0) {
    timer = setInterval(fetchQuote, sec * 1000);
  }
}

refreshBtn.addEventListener("click", fetchQuote);
intervalSelect.addEventListener("change", resetTimer);
rangeSelect.addEventListener("change", updateChart);

window.addEventListener("resize", () => chart.resize());

updateSummary();
updateChart();
resetTimer();
fetchQuote();

