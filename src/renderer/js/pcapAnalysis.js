(function () {
  function renderSummary(summary) {
    const element = document.getElementById("pcapSummary");
    const distribution = summary?.class_distribution || {};
    element.innerHTML = `
      <div class="summary-item"><span>Total flows</span><strong>${window.escapeHtml(summary?.total_flows || 0)}</strong></div>
      <div class="summary-item"><span>Benign</span><strong>${window.escapeHtml(summary?.benign_count || 0)}</strong></div>
      <div class="summary-item"><span>Malicious</span><strong>${window.escapeHtml(summary?.malicious_count || 0)}</strong></div>
      <div class="summary-item"><span>Classes</span><strong>${window.escapeHtml(Object.keys(distribution).length)}</strong></div>`;
  }

  function renderWarnings(warnings) {
    const element = document.getElementById("pcapWarnings");
    element.innerHTML = (warnings || []).map((warning) => `<div>${window.escapeHtml(warning)}</div>`).join("");
  }

  async function analyzePcap() {
    const file = document.getElementById("pcapFile").files[0];
    if (!file) {
      window.setMessage("pcapStatus", "Select a PCAP or PCAPNG file first.", "warn");
      return;
    }

    window.setMessage("pcapStatus", "Extracting flow features and running inference.", "warn");
    try {
      const result = await window.API.analyzePcap(file);
      renderWarnings(result.warnings || []);
      renderSummary(result.summary);
      window.Alerts.renderTable("pcapAlertsTable", result.alerts || [], { compact: true });
      window.setMessage("pcapStatus", `PCAP analysis complete. Stored alerts: ${result.storedAlertCount || 0}.`, "ok");
    } catch (error) {
      window.setMessage("pcapStatus", error.message, "error");
    }
  }

  function bind() {
    document.getElementById("analyzePcapButton").addEventListener("click", analyzePcap);
  }

  window.PcapAnalysis = { bind };
})();
