(function () {
  let selectedFiles = [];

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
  }

  function renderFileList() {
    const list = document.getElementById("pcapFileList");
    if (!selectedFiles.length) {
      list.innerHTML = '<div class="file-card"><span>No PCAP files selected.</span></div>';
      return;
    }
    list.innerHTML = selectedFiles
      .map(
        (file, index) => `<div class="file-card">
          <strong>${window.escapeHtml(file.name)}</strong>
          <span>${window.escapeHtml(formatBytes(file.size))} | queued #${index + 1}</span>
        </div>`
      )
      .join("");
  }

  function renderSummary(summary) {
    const distribution = summary?.class_distribution || {};
    return `
      <div class="summary-grid">
        <div class="summary-item"><span>Total flows</span><strong>${window.escapeHtml(summary?.total_flows || 0)}</strong></div>
        <div class="summary-item"><span>Benign</span><strong>${window.escapeHtml(summary?.benign_count || 0)}</strong></div>
        <div class="summary-item"><span>Malicious</span><strong>${window.escapeHtml(summary?.malicious_count || 0)}</strong></div>
        <div class="summary-item"><span>Classes</span><strong>${window.escapeHtml(Object.keys(distribution).length)}</strong></div>
      </div>`;
  }

  function renderWarnings(warnings) {
    return (warnings || []).map((warning) => `<div>${window.escapeHtml(warning)}</div>`).join("");
  }

  function appendResult(file, result) {
    const deck = document.getElementById("pcapResultDeck");
    const block = document.createElement("div");
    const tableId = `pcapAlertsTable_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    block.className = "result-block";
    block.innerHTML = `
      <h3>${window.escapeHtml(file.name)}</h3>
      <div class="warning-list">${renderWarnings(result.warnings || [])}</div>
      ${renderSummary(result.summary)}
      <div class="table-wrap result-scroll"><table id="${tableId}"></table></div>`;
    deck.prepend(block);
    window.Alerts.renderTable(tableId, result.alerts || [], { compact: true, actions: true });
  }

  async function analyzePcap() {
    if (!selectedFiles.length) {
      window.setMessage("pcapStatus", "Select at least one PCAP or PCAPNG file first.", "warn");
      return;
    }

    document.getElementById("pcapWarnings").innerHTML = "";
    document.getElementById("pcapResultDeck").innerHTML = "";
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      window.setMessage("pcapStatus", `Analyzing ${file.name} (${index + 1}/${selectedFiles.length}).`, "warn");
      try {
        const result = await window.API.analyzePcap(file);
        appendResult(file, result);
        window.setMessage("pcapStatus", `Finished ${index + 1}/${selectedFiles.length}. Stored alerts: ${result.storedAlertCount || 0}.`, "ok");
      } catch (error) {
        window.setMessage("pcapStatus", `${file.name}: ${error.message}`, "error");
        break;
      }
    }
  }

  function setFiles(files) {
    selectedFiles = Array.from(files || []).filter((file) => /\.(pcap|pcapng)$/i.test(file.name));
    renderFileList();
    window.setMessage("pcapStatus", selectedFiles.length ? `${selectedFiles.length} PCAP file(s) queued.` : "No PCAP files selected.", "");
  }

  function bindDropZone() {
    const box = document.querySelector('[data-upload="pcap"]');
    box.addEventListener("dragover", (event) => {
      event.preventDefault();
      box.classList.add("drag-over");
    });
    box.addEventListener("dragleave", () => box.classList.remove("drag-over"));
    box.addEventListener("drop", (event) => {
      event.preventDefault();
      box.classList.remove("drag-over");
      setFiles(event.dataTransfer.files);
    });
  }

  function bind() {
    document.getElementById("selectPcapButton").addEventListener("click", () => document.getElementById("pcapFile").click());
    document.getElementById("pcapFile").addEventListener("change", (event) => setFiles(event.target.files));
    document.getElementById("analyzePcapButton").addEventListener("click", analyzePcap);
    document.getElementById("pcapResultDeck").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (button) window.Alerts.handleAction(button.dataset.action, button.dataset.id);
    });
    bindDropZone();
    renderFileList();
  }

  window.PcapAnalysis = { bind };
})();
