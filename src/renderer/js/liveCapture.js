(function () {
  function renderAlertRows(tableId, alerts) {
    const table = document.getElementById(tableId);
    if (!table) return;
    if (!alerts.length) {
      table.innerHTML = "<tbody><tr><td>No live alerts yet.</td></tr></tbody>";
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Time</th><th>Source</th><th>Destination</th><th>Prediction</th><th>Confidence</th><th>Severity</th></tr></thead>
      <tbody>
        ${alerts
          .map(
            (alert) => `<tr>
              <td>${window.escapeHtml(window.formatDate(alert.timestamp))}</td>
              <td>${window.escapeHtml(alert.source?.ip || "unknown")}:${window.escapeHtml(alert.source?.port || "")}</td>
              <td>${window.escapeHtml(alert.destination?.ip || "unknown")}:${window.escapeHtml(alert.destination?.port || "")}</td>
              <td>${window.escapeHtml(alert.ml?.prediction || "")}</td>
              <td>${window.escapeHtml(window.formatPercent(alert.ml?.confidence))}</td>
              <td><span class="badge ${window.escapeHtml(alert.threat?.severity || "Medium")}">${window.escapeHtml(alert.threat?.severity || "Medium")}</span></td>
            </tr>`
          )
          .join("")}
      </tbody>`;
  }

  async function startCapture() {
    const interfaceName = document.getElementById("captureInterface").value.trim();
    const windowSeconds = Number(document.getElementById("captureWindow").value || 5);
    window.setMessage("captureMessage", "Starting capture worker.", "warn");
    try {
      const result = await window.API.startCapture({ interfaceName, windowSeconds });
      document.getElementById("liveStatus").textContent = "running";
      window.setMessage("captureMessage", `Capture session ${result.sessionId} started.`, "ok");
    } catch (error) {
      window.setMessage("captureMessage", error.message, "error");
    }
  }

  async function stopCapture() {
    try {
      const result = await window.API.stopCapture();
      document.getElementById("liveStatus").textContent = "stopping";
      window.setMessage("captureMessage", result.message || "Stop requested.", "warn");
    } catch (error) {
      window.setMessage("captureMessage", error.message, "error");
    }
  }

  function updateStatus(event) {
    if (!event) return;
    if (event.status) document.getElementById("liveStatus").textContent = event.status;
    if (event.packets !== undefined) document.getElementById("livePackets").textContent = event.packets;
    if (event.message) window.setMessage("captureMessage", event.message, event.type === "error" ? "error" : "warn");
  }

  function appendAlerts(alerts, summary = {}) {
    const liveAlerts = (alerts || []).concat(window.AppState.liveAlerts || []).slice(0, 100);
    window.AppState.liveAlerts = liveAlerts;
    const alertCount = Number(document.getElementById("liveAlerts").textContent || 0) + Number(summary.malicious_count || alerts.length || 0);
    document.getElementById("liveAlerts").textContent = alertCount;
    const flowCount = Number(document.getElementById("liveFlows").textContent || 0) + Number(summary.total_flows || 0);
    document.getElementById("liveFlows").textContent = flowCount;
    renderAlertRows("liveAlertsTable", liveAlerts);
  }

  function bind() {
    document.getElementById("startCaptureButton").addEventListener("click", startCapture);
    document.getElementById("stopCaptureButton").addEventListener("click", stopCapture);
    renderAlertRows("liveAlertsTable", []);
  }

  window.LiveCapture = {
    bind,
    updateStatus,
    appendAlerts
  };
})();
