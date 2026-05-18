(function () {
  const colors = ["#35c2a9", "#5aa8ff", "#e2b84b", "#ff6674", "#9a7bff", "#55d27f"];

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
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, rect.width * window.devicePixelRatio);
    canvas.height = 170 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, rect.width, 170);

    const entries = Object.entries(data).slice(0, 8);
    if (entries.length === 0) {
      ctx.fillStyle = "#8fa3b8";
      ctx.fillText("No data yet", 14, 28);
      return;
    }

    const max = Math.max(...entries.map((entry) => entry[1]), 1);
    const barWidth = Math.max((rect.width - 32) / entries.length - 10, 18);
    entries.forEach(([label, value], index) => {
      const height = Math.max((value / max) * 96, 4);
      const x = 16 + index * (barWidth + 10);
      const y = 128 - height;
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(x, y, barWidth, height);
      ctx.fillStyle = "#d8e4f0";
      ctx.font = "12px Segoe UI";
      ctx.fillText(String(value), x, y - 6);
      ctx.fillStyle = "#8fa3b8";
      ctx.fillText(label.length > 12 ? `${label.slice(0, 11)}.` : label, x, 150);
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

  window.Dashboard = { render };
})();
