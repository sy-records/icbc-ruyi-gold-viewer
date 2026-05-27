const MAX_POINTS = 25000;
const STORAGE_KEY = "icbc_ruyi_trend_points";
const MONITOR_STORAGE_KEY = "icbc_ruyi_price_monitor";
const API_ENDPOINTS = ["/api/quote.php"];

const refreshBtn = document.getElementById("refreshBtn");
const intervalSelect = document.getElementById("intervalSelect");
const rangeSelect = document.getElementById("rangeSelect");
const monitorFieldSelect = document.getElementById("monitorFieldSelect");
const monitorDirectionSelect = document.getElementById("monitorDirectionSelect");
const monitorPriceInput = document.getElementById("monitorPriceInput");
const testNotifyBtn = document.getElementById("testNotifyBtn");
const monitorState = document.getElementById("monitorState");
const statusText = document.getElementById("statusText");
const buyPrice = document.getElementById("buyPrice");
const sellPrice = document.getElementById("sellPrice");
const quoteTime = document.getElementById("quoteTime");

const chart = echarts.init(document.getElementById("chart"));

let timer = null;
let points = loadPoints();
let monitorConfig = loadMonitorConfig();
let monitorTriggered = false;

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

function loadMonitorConfig() {
  try {
    const raw = localStorage.getItem(MONITOR_STORAGE_KEY);
    if (!raw) {
      return { field: "sell", direction: "gte", target: null };
    }

    const parsed = JSON.parse(raw);
    const field = parsed?.field === "buy" ? "buy" : "sell";
    const direction = parsed?.direction === "lte" ? "lte" : "gte";
    const target = Number(parsed?.target);

    return {
      field,
      direction,
      target: Number.isFinite(target) && target > 0 ? target : null
    };
  } catch {
    return { field: "sell", direction: "gte", target: null };
  }
}

function saveMonitorConfig() {
  localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(monitorConfig));
}

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function isMonitorEnabled() {
  return typeof monitorConfig.target === "number";
}

function isTargetReached(quote) {
  if (!isMonitorEnabled()) {
    return false;
  }

  const current = monitorConfig.field === "buy" ? quote.buy : quote.sell;
  if (monitorConfig.direction === "lte") {
    return current <= monitorConfig.target;
  }
  return current >= monitorConfig.target;
}

function updateMonitorState() {
  if (!monitorState) {
    return;
  }

  if (!isMonitorEnabled()) {
    monitorState.textContent = "价格监控未开启";
    return;
  }

  const fieldText = monitorConfig.field === "buy" ? "买入价" : "卖出价";
  const directionText = monitorConfig.direction === "lte" ? "<=" : ">=";
  let suffix = "";

  if (!("Notification" in window)) {
    suffix = "（当前浏览器不支持通知）";
  } else if (Notification.permission === "denied") {
    suffix = "（通知权限已被拒绝）";
  }

  monitorState.textContent = `监控${fieldText} ${directionText} ${monitorConfig.target.toFixed(2)}${suffix}`;
}

async function ensureNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }

  try {
    await Notification.requestPermission();
  } catch {
    // Ignore permission errors and continue with fallback status text.
  }
}

function sendBrowserNotification(title, body) {
  if (!("Notification" in window)) {
    return { ok: false, reason: "浏览器不支持通知" };
  }

  if (!window.isSecureContext) {
    return { ok: false, reason: "当前页面不是安全上下文(HTTPS/localhost)" };
  }

  if (Notification.permission !== "granted") {
    return { ok: false, reason: `通知权限状态: ${Notification.permission}` };
  }

  try {
    new Notification(title, { body });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "创建通知失败" };
  }
}

function notifyPriceReached(quote) {
  const fieldText = monitorConfig.field === "buy" ? "买入价" : "卖出价";
  const current = monitorConfig.field === "buy" ? quote.buy : quote.sell;
  const result = sendBrowserNotification(
    "如意积存金价格提醒",
    `${fieldText}到达${monitorConfig.target.toFixed(2)}，当前 ${current.toFixed(2)} (${formatTime(quote.timestamp)})`
  );

  if (!result.ok) {
    statusText.textContent = `价格到达但通知失败: ${result.reason}`;
  }
}

function getCurrentMonitorRuleText() {
  if (!isMonitorEnabled()) {
    return "未开启";
  }

  const fieldText = monitorConfig.field === "buy" ? "买入价" : "卖出价";
  const directionText = monitorConfig.direction === "lte" ? "<=" : ">=";
  return `${fieldText} ${directionText} ${monitorConfig.target.toFixed(2)}`;
}

function notifyTestMessage() {
  if (!("Notification" in window)) {
    statusText.textContent = "当前浏览器不支持通知";
    return;
  }

  const latest = points[points.length - 1];
  const latestText = latest
    ? `当前买入 ${latest.buy.toFixed(2)} / 卖出 ${latest.sell.toFixed(2)}`
    : "当前暂无报价数据";
  const ruleText = getCurrentMonitorRuleText();
  const message = `当前监控规则: ${ruleText}；${latestText} (${formatTime(new Date().toISOString())})`;
  const result = sendBrowserNotification("如意积存金测试提醒", message);

  if (result.ok) {
    statusText.textContent = "已发送测试提醒";
    return;
  }

  statusText.textContent = `测试提醒未弹出: ${result.reason}`;
  // Fallback so users still see the message when system notifications are blocked.
  alert(`测试提醒\n${message}`);
}

function checkMonitor(quote) {
  if (!isMonitorEnabled()) {
    return;
  }

  const reached = isTargetReached(quote);
  if (reached && !monitorTriggered) {
    monitorTriggered = true;
    notifyPriceReached(quote);
  }

  if (!reached) {
    monitorTriggered = false;
  }
}

function parseMonitorTarget(value) {
  const target = Number(value);
  return Number.isFinite(target) && target > 0 ? target : null;
}

function syncMonitorConfigFromControls() {
  monitorConfig = {
    field: monitorFieldSelect?.value === "buy" ? "buy" : "sell",
    direction: monitorDirectionSelect?.value === "lte" ? "lte" : "gte",
    target: parseMonitorTarget(monitorPriceInput?.value)
  };

  saveMonitorConfig();

  const latest = points[points.length - 1];
  monitorTriggered = latest ? isTargetReached(latest) : false;
  updateMonitorState();
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
    checkMonitor(quote);
    statusText.textContent = ``;
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
monitorFieldSelect?.addEventListener("change", syncMonitorConfigFromControls);
monitorDirectionSelect?.addEventListener("change", syncMonitorConfigFromControls);
monitorPriceInput?.addEventListener("change", async () => {
  syncMonitorConfigFromControls();
  if (isMonitorEnabled()) {
    await ensureNotificationPermission();
    updateMonitorState();
  }
});
testNotifyBtn?.addEventListener("click", async () => {
  await ensureNotificationPermission();
  if ("Notification" in window && Notification.permission !== "granted") {
    statusText.textContent = `通知权限未开启: ${Notification.permission}`;
  }
  notifyTestMessage();
  updateMonitorState();
});

window.addEventListener("resize", () => chart.resize());

if (monitorFieldSelect) {
  monitorFieldSelect.value = monitorConfig.field;
}
if (monitorDirectionSelect) {
  monitorDirectionSelect.value = monitorConfig.direction;
}
if (monitorPriceInput && isMonitorEnabled()) {
  monitorPriceInput.value = String(monitorConfig.target);
}

const latest = points[points.length - 1];
monitorTriggered = latest ? isTargetReached(latest) : false;
updateMonitorState();

updateSummary();
updateChart();
resetTimer();
fetchQuote();

