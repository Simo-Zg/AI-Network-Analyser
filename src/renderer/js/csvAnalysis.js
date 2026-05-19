(function () {
  let selectedFiles = [];

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
  }

  function renderFileList() {
    const list = document.getElementById("csvFileList");
    if (!selectedFiles.length) {
      list.innerHTML = '<div class="file-card"><span>No CSV files selected.</span></div>';
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

  function appendResult(file, result) {
    const deck = document.getElementById("csvResultDeck");
    const block = document.createElement("div");
    const tableId = `csvAlertsTable_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    block.className = "result-block";
    block.innerHTML = `
      <h3>${window.escapeHtml(file.name)}</h3>
      ${renderSummary(result.summary)}
      <div class="table-wrap result-scroll"><table id="${tableId}"></table></div>`;
    deck.prepend(block);
    window.Alerts.renderTable(tableId, result.alerts || [], { compact: true, actions: true });
  }

  async function analyzeCsv() {
    if (!selectedFiles.length) {
      window.setMessage("csvStatus", "Select at least one CSV file first.", "warn");
      return;
    }

    document.getElementById("csvResultDeck").innerHTML = "";
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      window.setMessage("csvStatus", `Analyzing ${file.name} (${index + 1}/${selectedFiles.length}).`, "warn");
      try {
        const result = await window.API.analyzeCsv(file);
        appendResult(file, result);
        window.setMessage("csvStatus", `Finished ${index + 1}/${selectedFiles.length}. Stored alerts: ${result.storedAlertCount || 0}.`, "ok");
      } catch (error) {
        window.setMessage("csvStatus", `${file.name}: ${error.message}`, "error");
        break;
      }
    }
  }

  function setFiles(files) {
    selectedFiles = Array.from(files || []);
    renderFileList();
    window.setMessage("csvStatus", selectedFiles.length ? `${selectedFiles.length} CSV file(s) queued.` : "No CSV files selected.", "");
  }

  function bindDropZone() {
    const box = document.querySelector('[data-upload="csv"]');
    box.addEventListener("dragover", (event) => {
      event.preventDefault();
      box.classList.add("drag-over");
    });
    box.addEventListener("dragleave", () => box.classList.remove("drag-over"));
    box.addEventListener("drop", (event) => {
      event.preventDefault();
      box.classList.remove("drag-over");
      setFiles(Array.from(event.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith(".csv")));
    });
  }

  function bind() {
    document.getElementById("selectCsvButton").addEventListener("click", () => document.getElementById("csvFile").click());
    document.getElementById("csvFile").addEventListener("change", (event) => setFiles(event.target.files));
    document.getElementById("analyzeCsvButton").addEventListener("click", analyzeCsv);
    document.getElementById("csvResultDeck").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (button) window.Alerts.handleAction(button.dataset.action, button.dataset.id);
    });
    bindDropZone();
    renderFileList();
  }

  window.CsvAnalysis = { bind };
})();
