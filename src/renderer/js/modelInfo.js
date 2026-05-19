(function () {
  function metric(label, value) {
    return `<div class="summary-item"><span>${window.escapeHtml(label)}</span><strong>${window.escapeHtml(value ?? "n/a")}</strong></div>`;
  }

  function percent(value) {
    if (value === undefined || value === null) return "n/a";
    return `${(Number(value) * 100).toFixed(2)}%`;
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

  async function loadTreePreviewImage(img, statusElement) {
    try {
      statusElement.textContent = "Loading tree preview...";
      statusElement.dataset.tone = "";
      const response = await fetch(`${window.API.baseUrl}/api/model/tree-preview.png?ts=${Date.now()}`);
      if (!response.ok) {
        let message = `Tree preview request failed with status ${response.status}`;
        try {
          const payload = await response.json();
          message = payload.error || message;
        } catch (_error) {
          // Keep the status-based message.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error(`Tree preview returned ${blob.type || "non-image data"}`);
      }
      const previousUrl = img.dataset.objectUrl;
      const objectUrl = URL.createObjectURL(blob);
      img.dataset.objectUrl = objectUrl;
      img.src = objectUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      statusElement.textContent = "Tree preview loaded.";
      statusElement.dataset.tone = "ok";
    } catch (error) {
      statusElement.textContent = `${error.message}. Restart the API/Electron app if you just changed the backend.`;
      statusElement.dataset.tone = "error";
    }
  }

  function bindTreeControls() {
    const treeImage = document.getElementById("modelTreeGraphImage");
    const treeStatus = document.getElementById("modelTreeStatus");
    const treeFrameWrap = document.getElementById("modelTreeTextWrap");
    const loadFullTreeButton = document.getElementById("loadFullTreeTextButton");
    const renderFullTreeImageButton = document.getElementById("renderFullTreeImageButton");

    if (treeImage && treeStatus) {
      loadTreePreviewImage(treeImage, treeStatus);
    }

    if (loadFullTreeButton && treeFrameWrap) {
      loadFullTreeButton.addEventListener("click", () => {
        treeFrameWrap.hidden = false;
        treeFrameWrap.innerHTML = "";
        const frame = document.createElement("iframe");
        frame.className = "model-tree-frame";
        frame.title = "Complete Random Forest tree text";
        frame.src = `${window.API.baseUrl}/api/model/tree-text.txt?ts=${Date.now()}`;
        frame.addEventListener("load", () => {
          window.setMessage("modelTreeStatus", "Complete tree text loaded.", "ok");
        });
        treeFrameWrap.appendChild(frame);
        window.setMessage(
          "modelTreeStatus",
          "Loading the complete tree text. The first load can take a while because the model artifact is large.",
          "warn"
        );
      });
    }

    if (renderFullTreeImageButton && treeImage) {
      renderFullTreeImageButton.addEventListener("click", () => {
        treeImage.src = `${window.API.baseUrl}/api/model/tree-graph.png?maxDepth=full&ts=${Date.now()}`;
        window.setMessage(
          "modelTreeStatus",
          "Rendering the full PNG. This can be very slow or too large to view for deep Random Forest trees.",
          "warn"
        );
      });
    }
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
        <h3>Random Forest Tree Preview</h3>
        <div class="button-row tree-actions">
          <button id="loadFullTreeTextButton" class="secondary-button">Show Whole Tree Text</button>
          <button id="renderFullTreeImageButton" class="secondary-button">Try Full PNG</button>
        </div>
        <div id="modelTreeStatus" class="status-message">Loading tree preview...</div>
        <div class="model-plot-image-wrap">
          <img
            id="modelTreeGraphImage"
            class="model-plot-image"
            alt="Random Forest decision tree preview"
          >
        </div>
        <div id="modelTreeTextWrap" class="model-tree-text-wrap" hidden></div>
        <p class="muted-note">Preview uses one estimator from the saved forest. The full text view exports every node; the full PNG option is experimental for very deep trees.</p>
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
    bindTreeControls();
  }

  window.ModelInfo = { render };
})();
