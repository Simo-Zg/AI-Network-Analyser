(function () {
  function metric(label, value) {
    return `<div class="summary-item"><span>${window.escapeHtml(label)}</span><strong>${window.escapeHtml(value ?? "n/a")}</strong></div>`;
  }

  function percent(value) {
    if (value === undefined || value === null) return "n/a";
    return `${(Number(value) * 100).toFixed(2)}%`;
  }

  function drawHistoryChart(history) {
    const canvas = document.getElementById("modelAccuracyChart");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(520, rect.width || 720);
    const height = 220;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);

    if (!history.length) {
      ctx.fillStyle = "#8fa3b8";
      ctx.fillText("No training history yet.", 16, 28);
      return;
    }

    const padding = { top: 20, right: 18, bottom: 48, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const points = history.map((entry, index) => ({
      index,
      label: entry.modelVersion || `run ${index + 1}`,
      accuracy: Number(entry.metrics?.accuracy || 0),
      macroF1: Number(entry.metrics?.macroF1 || 0),
      weightedF1: Number(entry.metrics?.weightedF1 || 0)
    }));
    const xFor = (index) => padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const yFor = (value) => padding.top + plotHeight - Math.max(0, Math.min(1, value)) * plotHeight;

    ctx.strokeStyle = "#24354d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.stroke();

    [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
      const y = yFor(tick);
      ctx.strokeStyle = "#17263a";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
      ctx.fillStyle = "#8fa3b8";
      ctx.font = "12px Segoe UI";
      ctx.fillText(`${Math.round(tick * 100)}%`, 8, y + 4);
    });

    function line(key, color, label, labelY) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      points.forEach((point, index) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(xFor(index), yFor(point[key]), 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = color;
      ctx.fillText(label, padding.left + 8, labelY);
    }

    line("accuracy", "#35c2a9", "accuracy", 18);
    line("macroF1", "#5aa8ff", "macro F1", 36);
    line("weightedF1", "#e2b84b", "weighted F1", 54);

    ctx.fillStyle = "#8fa3b8";
    ctx.font = "11px Segoe UI";
    points.forEach((point, index) => {
      const label = point.label.replace(/^rf-multiclass-/, "");
      ctx.fillText(label.slice(-10), xFor(index) - 28, height - 16);
    });
  }

  function confusionMatrixHtml(metrics) {
    const matrix = metrics.confusionMatrix || [];
    const labels = metrics.confusionMatrixLabels || [];
    if (!matrix.length || !labels.length) {
      return "<p>No confusion matrix recorded yet.</p>";
    }
    return `
      <div class="confusion-wrap">
        <table class="confusion-table">
          <thead>
            <tr><th>Actual \\ Predicted</th>${labels.map((label) => `<th>${window.escapeHtml(label)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${matrix
              .map(
                (row, rowIndex) => `<tr>
                  <th>${window.escapeHtml(labels[rowIndex] || `class ${rowIndex + 1}`)}</th>
                  ${row
                    .map((value, columnIndex) => {
                      const className = rowIndex === columnIndex ? "matrix-hit" : value ? "matrix-miss" : "";
                      return `<td class="${className}">${window.escapeHtml(value)}</td>`;
                    })
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function featureImportanceHtml(items) {
    if (!items.length) return "<p>No feature importance recorded yet.</p>";
    const max = Math.max(...items.map((item) => Number(item.importance || 0)), 0.000001);
    return `
      <div class="feature-bars">
        ${items
          .slice(0, 12)
          .map((item) => {
            const width = Math.max((Number(item.importance || 0) / max) * 100, 2);
            return `<div class="feature-bar">
              <span>${window.escapeHtml(item.feature)}</span>
              <div><i style="width:${width}%"></i></div>
              <b>${Number(item.importance || 0).toFixed(4)}</b>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  function dataProfileHtml(profile) {
    if (!profile) return "<p>No data profile recorded yet.</p>";
    return `
      <div class="summary-grid">
        ${metric("Raw rows", profile.rawRows)}
        ${metric("Rows after cleaning", profile.rowsAfterCleaning)}
        ${metric("Train rows", profile.trainRows)}
        ${metric("Test rows", profile.testRows)}
        ${metric("Duplicates removed", profile.duplicateRowsRemoved)}
        ${metric("Dataset files", profile.datasetFileCount)}
        ${metric("Selected features", profile.selectedFeatureCount)}
        ${metric("Missing supported", profile.missingSupportedFeatureCount)}
      </div>
      <pre>${window.escapeHtml(JSON.stringify(profile.classDistribution || {}, null, 2))}</pre>`;
  }

  function render() {
    const panel = document.getElementById("modelInfoPanel");
    const payload = window.AppState.modelInfo || {};
    const metadata = payload.metadata || payload.storedMetadata || {};
    const model = payload.model || {};
    const metrics = metadata.metrics || {};
    const classes = metadata.supportedClasses || model.supportedClasses || [];
    const features = metadata.features || [];
    const history = payload.history || [];
    const latestHistory = history[history.length - 1] || {};
    const latestMetrics = latestHistory.metrics || metrics;
    const featureImportance = metadata.featureImportance || latestHistory.topFeatureImportance || [];

    panel.innerHTML = `
      <div class="summary-grid">
        ${metric("Model", metadata.modelName || model.name || "unknown")}
        ${metric("Version", metadata.modelVersion || model.version || "unknown")}
        ${metric("Classes", classes.length)}
        ${metric("Legacy fallback", model.legacy ? "yes" : "no")}
        ${metric("Accuracy", percent(metrics.accuracy))}
        ${metric("Macro F1", percent(metrics.macroF1))}
        ${metric("History runs", history.length)}
        ${metric("Train rows", metadata.dataProfile?.trainRows || latestHistory.dataProfile?.trainRows)}
      </div>
      <div class="detail-section">
        <h3>Accuracy History</h3>
        <canvas id="modelAccuracyChart" class="history-chart"></canvas>
      </div>
      <div class="detail-section">
        <h3>Latest Confusion Matrix</h3>
        ${confusionMatrixHtml(latestMetrics)}
      </div>
      <div class="detail-section">
        <h3>Training Data Profile</h3>
        ${dataProfileHtml(metadata.dataProfile || latestHistory.dataProfile)}
      </div>
      <div class="detail-section">
        <h3>Top Feature Importance</h3>
        ${featureImportanceHtml(featureImportance)}
      </div>
      <div class="detail-section">
        <h3>Supported Classes</h3>
        <p>${classes.map(window.escapeHtml).join(", ") || "No trained model metadata found."}</p>
      </div>
      <div class="detail-section">
        <h3>Metrics</h3>
        <pre>${window.escapeHtml(JSON.stringify(metrics, null, 2))}</pre>
      </div>
      <div class="detail-section">
        <h3>Features</h3>
        <p>${features.map(window.escapeHtml).join(", ") || "No feature metadata found."}</p>
      </div>
      <div class="detail-section">
        <h3>Limitations</h3>
        <p>${window.escapeHtml(metadata.notes || "Train a multiclass model to replace the legacy binary DDoS-vs-BENIGN fallback.")}</p>
      </div>`;
    drawHistoryChart(history);
  }

  window.ModelInfo = { render };
})();
