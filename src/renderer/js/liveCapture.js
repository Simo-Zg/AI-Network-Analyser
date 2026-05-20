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
    const captureFilter = document.getElementById("captureFilter").value.trim();
    window.setMessage("captureMessage", "Starting capture worker.", "warn");
    try {
      const result = await window.API.startCapture({ interfaceName, windowSeconds, captureFilter });
      document.getElementById("liveStatus").textContent = "running";
      window.setMessage("captureMessage", `Capture session ${result.sessionId} started.`, "ok");
    } catch (error) {
      window.setMessage("captureMessage", error.message, "error");
    }
  }

  async function refreshInterfaces() {
    const list = document.getElementById("captureInterfaceOptions");
    if (!list) return;
    try {
      const payload = await window.API.captureInterfaces();
      const interfaces = payload.interfaces || [];
      list.innerHTML = interfaces
        .map((item) => {
          const ips = (item.ips || []).join(", ");
          const label = [item.description || item.name, ips].filter(Boolean).join(" | ");
          return `<option value="${window.escapeHtml(item.name)}" label="${window.escapeHtml(label)}"></option>`;
        })
        .join("");
      const hint = interfaces.length
        ? `Found ${interfaces.length} capture interfaces. Pick the adapter whose IP matches the attacked server.`
        : "No capture interfaces were reported by Scapy. Check Npcap and administrator privileges.";
      window.setMessage("captureMessage", hint, interfaces.length ? "ok" : "warn");
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
    if (event.status) {
      document.getElementById("liveStatus").textContent =
        event.status === "window_empty" ? "waiting for flows" : event.status;
    }
    if (event.packets !== undefined) document.getElementById("livePackets").textContent = event.packets;
    if (event.flows !== undefined) document.getElementById("liveFlows").textContent = event.flows;
    if (event.status === "window_empty" && !event.message) {
      window.setMessage(
        "captureMessage",
        "No usable flows in this capture window. Check the selected interface, Npcap/admin privileges, and loopback traffic.",
        "warn"
      );
      return;
    }
    if (event.message) window.setMessage("captureMessage", event.message, event.type === "error" ? "error" : "warn");
  }

  function appendAlerts(alerts, summary = {}, packetsCaptured) {
    const liveAlerts = (alerts || []).concat(window.AppState.liveAlerts || []).slice(0, 100);
    window.AppState.liveAlerts = liveAlerts;
    if (packetsCaptured !== undefined) {
      document.getElementById("livePackets").textContent = packetsCaptured;
    }
    const alertCount = Number(document.getElementById("liveAlerts").textContent || 0) + Number(summary.malicious_count || alerts.length || 0);
    document.getElementById("liveAlerts").textContent = alertCount;
    const flowCount = Number(document.getElementById("liveFlows").textContent || 0) + Number(summary.total_flows || 0);
    document.getElementById("liveFlows").textContent = flowCount;
    renderAlertRows("liveAlertsTable", liveAlerts);
  }

  function bind() {
    document.getElementById("startCaptureButton").addEventListener("click", startCapture);
    document.getElementById("stopCaptureButton").addEventListener("click", stopCapture);
    document.getElementById("refreshInterfacesButton").addEventListener("click", refreshInterfaces);
    renderAlertRows("liveAlertsTable", []);
    refreshInterfaces();
  }

  window.LiveCapture = {
    bind,
    updateStatus,
    appendAlerts
  };
})();
