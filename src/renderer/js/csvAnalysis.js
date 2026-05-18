(function () {
  function renderSummary(id, summary) {
    const element = document.getElementById(id);
    const distribution = summary?.class_distribution || {};
    element.innerHTML = `
      <div class="summary-item"><span>Total flows</span><strong>${window.escapeHtml(summary?.total_flows || 0)}</strong></div>
      <div class="summary-item"><span>Benign</span><strong>${window.escapeHtml(summary?.benign_count || 0)}</strong></div>
      <div class="summary-item"><span>Malicious</span><strong>${window.escapeHtml(summary?.malicious_count || 0)}</strong></div>
      <div class="summary-item"><span>Classes</span><strong>${window.escapeHtml(Object.keys(distribution).length)}</strong></div>`;
  }

  function renderAlerts(tableId, alerts) {
    window.Alerts.renderTable(tableId, alerts || [], { compact: true });
  }

  async function analyzeCsv() {
    const file = document.getElementById("csvFile").files[0];
    if (!file) {
      window.setMessage("csvStatus", "Select a CSV file first.", "warn");
      return;
    }

    window.setMessage("csvStatus", "Analyzing CSV and storing alerts.", "warn");
    try {
      const result = await window.API.analyzeCsv(file);
      renderSummary("csvSummary", result.summary);
      renderAlerts("csvAlertsTable", result.alerts || []);
      window.setMessage("csvStatus", `Analysis complete. Stored alerts: ${result.storedAlertCount || 0}.`, "ok");
    } catch (error) {
      window.setMessage("csvStatus", error.message, "error");
    }
  }

  function bind() {
    document.getElementById("analyzeCsvButton").addEventListener("click", analyzeCsv);
  }

  window.CsvAnalysis = { bind };
})();
