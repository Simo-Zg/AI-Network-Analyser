(function () {
  const fallbackColors = ["#3b82f6", "#10b981", "#d6a93a", "#ef5350", "#8b5cf6", "#14b8a6"];
  let lastDashboardData = null;
  let resizeTimer = null;

  function chartColors() {
    const styles = getComputedStyle(document.body);
    return [
      styles.getPropertyValue("--accent").trim(),
      styles.getPropertyValue("--green").trim(),
      styles.getPropertyValue("--amber").trim(),
      styles.getPropertyValue("--red").trim(),
      styles.getPropertyValue("--blue").trim(),
      "#8b5cf6"
    ].filter(Boolean);
  }

  function countBy(items, getter) {
    return items.reduce((acc, item) => {
      const key = getter(item) || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function sumBatches(field) {
    return window.AppState.batches.reduce((total, batch) => total + Number(batch[field] || 0), 0);
  }

  function drawBarChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parentWidth = canvas.parentElement?.clientWidth || 0;
    const cssWidth = Math.max(260, Math.floor(canvas.clientWidth || parentWidth - 32 || 320));
    const cssHeight = 170;
    const ratio = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    canvas.style.width = "100%";
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const styles = getComputedStyle(document.body);
    const textColor = styles.getPropertyValue("--text").trim() || "#e0e0e0";
    const mutedColor = styles.getPropertyValue("--muted").trim() || "#a0aec0";
    const borderColor = styles.getPropertyValue("--border").trim() || "#374151";
    const colors = chartColors();

    const entries = Object.entries(data).slice(0, 8);
    if (entries.length === 0) {
      ctx.fillStyle = mutedColor;
      ctx.font = "13px Segoe UI";
      ctx.fillText("No data yet", 14, 28);
      return;
    }

    const max = Math.max(...entries.map((entry) => entry[1]), 1);
    const left = 18;
    const right = 12;
    const bottom = 34;
    const top = 16;
    const plotWidth = cssWidth - left - right;
    const plotHeight = cssHeight - top - bottom;
    const gap = Math.max(8, Math.min(14, plotWidth / entries.length / 4));
    const barWidth = Math.max((plotWidth - gap * (entries.length - 1)) / entries.length, 14);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top + plotHeight);
    ctx.lineTo(cssWidth - right, top + plotHeight);
    ctx.stroke();

    entries.forEach(([label, value], index) => {
      const height = Math.max((value / max) * (plotHeight - 18), 4);
      const x = left + index * (barWidth + gap);
      const y = top + plotHeight - height;
      ctx.fillStyle = colors[index % colors.length] || fallbackColors[index % fallbackColors.length];
      ctx.fillRect(x, y, barWidth, height);
      ctx.fillStyle = textColor;
      ctx.font = "12px Segoe UI";
      ctx.fillText(String(value), x, y - 6);
      ctx.fillStyle = mutedColor;
      const safeLabel = label.length > 12 ? `${label.slice(0, 11)}.` : label;
      ctx.fillText(safeLabel, x, cssHeight - 10);
    });
  }

  function renderTable(id, rows, columns) {
    const table = document.getElementById(id);
    if (!table) return;
    if (!rows.length) {
      table.innerHTML = "<tbody><tr><td>No data yet.</td></tr></tbody>";
      return;
    }
    table.innerHTML = `
      <thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) =>
              `<tr>${columns.map((column) => `<td>${window.escapeHtml(column.value(row))}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>`;
  }

  function render() {
    const alerts = window.AppState.alerts;
    const batches = window.AppState.batches;
    const attackCounts = countBy(alerts, (alert) => alert.ml?.prediction);
    const severityCounts = countBy(alerts, (alert) => alert.threat?.severity);
    const sourceCounts = countBy(alerts, (alert) => alert.sourceType);
    const byHour = countBy(alerts, (alert) => {
      const date = new Date(alert.timestamp);
      if (Number.isNaN(date.getTime())) return "unknown";
      return `${date.getHours()}:00`;
    });

    const topAttack = Object.entries(attackCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
    lastDashboardData = {
      attackCounts,
      byHour,
      severityCounts,
      sourceCounts
    };
    document.getElementById("metricTotalFlows").textContent = batches.length ? sumBatches("totalFlows") : alerts.length;
    document.getElementById("metricTotalAlerts").textContent = alerts.length;
    document.getElementById("metricMalicious").textContent = batches.length ? sumBatches("maliciousCount") : alerts.length;
    document.getElementById("metricBenign").textContent = batches.length ? sumBatches("benignCount") : 0;
    document.getElementById("metricCapture").textContent = window.AppState.capture?.running ? "running" : "stopped";
    document.getElementById("metricTopAttack").textContent = topAttack;
    document.getElementById("metricHighSeverity").textContent = alerts.filter((alert) =>
      ["High", "Critical"].includes(alert.threat?.severity)
    ).length;

    drawBarChart("attackChart", attackCounts);
    drawBarChart("timeChart", byHour);
    drawBarChart("severityChart", severityCounts);
    drawBarChart("sourceTypeChart", sourceCounts);

    renderTable("recentAlertsTable", alerts.slice(0, 8), [
      { label: "Time", value: (row) => window.formatDate(row.timestamp) },
      { label: "Prediction", value: (row) => row.ml?.prediction },
      { label: "Confidence", value: (row) => window.formatPercent(row.ml?.confidence) },
      { label: "Severity", value: (row) => row.threat?.severity },
      { label: "Source", value: (row) => row.sourceType }
    ]);

    renderTable("captureSessionsTable", window.AppState.sessions.slice(0, 8), [
      { label: "Started", value: (row) => window.formatDate(row.startedAt) },
      { label: "Interface", value: (row) => row.interfaceName || "default" },
      { label: "Status", value: (row) => row.status },
      { label: "Flows", value: (row) => row.flowsGenerated || 0 },
      { label: "Alerts", value: (row) => row.alertsGenerated || 0 }
    ]);
  }

  function redrawCharts() {
    if (!lastDashboardData || !document.getElementById("dashboard")?.classList.contains("active-view")) return;
    drawBarChart("attackChart", lastDashboardData.attackCounts);
    drawBarChart("timeChart", lastDashboardData.byHour);
    drawBarChart("severityChart", lastDashboardData.severityCounts);
    drawBarChart("sourceTypeChart", lastDashboardData.sourceCounts);
  }

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawCharts, 120);
  });

  window.Dashboard = { render, redrawCharts };
})();
