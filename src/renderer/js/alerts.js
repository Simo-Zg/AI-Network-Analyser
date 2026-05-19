(function () {
  function endpointText(endpoint) {
    if (!endpoint) return "unknown";
    const host = endpoint.ip || endpoint.redactedIp || "unknown";
    return `${host}${endpoint.port ? `:${endpoint.port}` : ""}`;
  }

  function visibleEndpoint(endpoint) {
    if (!endpoint) return null;
    return {
      ip: endpoint.ip || "unknown",
      port: endpoint.port ?? null,
      type: endpoint.type || "unknown"
    };
  }

  function renderTable(tableId, alerts, options = {}) {
    const table = document.getElementById(tableId);
    if (!table) return;
    if (!alerts.length) {
      table.innerHTML = "<tbody><tr><td>No alerts found.</td></tr></tbody>";
      return;
    }

    const showActions = !options.compact || options.actions;
    const actionColumn = !showActions
      ? ""
      : "<th>Actions</th>";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Prediction</th>
          <th>Confidence</th><th>Severity</th><th>Source</th><th>AI</th><th>Status</th>${actionColumn}
        </tr>
      </thead>
      <tbody>
        ${alerts
          .map((alert) => {
            const id = alert.eventId || alert._id;
            const actions = !showActions
              ? ""
              : `<td>
                  <button data-action="details" data-id="${window.escapeHtml(id)}">Details</button>
                  <button data-action="explain" data-id="${window.escapeHtml(id)}">Explain</button>
                  <button data-action="reviewed" data-id="${window.escapeHtml(id)}">Reviewed</button>
                  <button data-action="confirmed" data-id="${window.escapeHtml(id)}">Confirm</button>
                  <button data-action="false_positive" data-id="${window.escapeHtml(id)}">False +</button>
                  <button data-action="export" data-id="${window.escapeHtml(id)}">Export</button>
                </td>`;
            return `<tr>
              <td>${window.escapeHtml(window.formatDate(alert.timestamp))}</td>
              <td>${window.escapeHtml(endpointText(alert.source))}</td>
              <td>${window.escapeHtml(endpointText(alert.destination))}</td>
              <td>${window.escapeHtml(alert.network?.protocol || "unknown")}</td>
              <td>${window.escapeHtml(alert.ml?.prediction || "unknown")}</td>
              <td>${window.escapeHtml(window.formatPercent(alert.ml?.confidence))}</td>
              <td><span class="badge ${window.escapeHtml(alert.threat?.severity || "Medium")}">${window.escapeHtml(alert.threat?.severity || "Medium")}</span></td>
              <td>${window.escapeHtml(alert.sourceType || "")}</td>
              <td>${window.escapeHtml(alert.aiExplanation?.status || "not_requested")}</td>
              <td>${window.escapeHtml(alert.status || "new")}</td>
              ${actions}
            </tr>`;
          })
          .join("")}
      </tbody>`;
  }

  function uniquePredictions(alerts) {
    return [...new Set(alerts.map((alert) => alert.ml?.prediction).filter(Boolean))].sort();
  }

  function renderFilters(alerts) {
    const select = document.getElementById("filterPrediction");
    const selected = select.value;
    select.innerHTML = `<option value="">All attacks</option>${uniquePredictions(alerts)
      .map((prediction) => `<option value="${window.escapeHtml(prediction)}">${window.escapeHtml(prediction)}</option>`)
      .join("")}`;
    select.value = selected;
  }

  function filtersFromUI() {
    return {
      prediction: document.getElementById("filterPrediction").value,
      severity: document.getElementById("filterSeverity").value,
      status: document.getElementById("filterStatus").value,
      sourceType: document.getElementById("filterSourceType").value,
      from: document.getElementById("filterFrom").value,
      to: document.getElementById("filterTo").value,
      limit: 250
    };
  }

  async function applyFilters() {
    const payload = await window.API.getAlerts(filtersFromUI());
    window.AppState.alerts = payload.alerts || [];
    render(window.AppState.alerts);
    window.Dashboard.render();
  }

  function listBlock(title, items) {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!safeItems.length) return "";
    return `
      <section class="ai-explanation-card">
        <h4>${window.escapeHtml(title)}</h4>
        <ul>${safeItems.map((item) => `<li>${window.escapeHtml(item)}</li>`).join("")}</ul>
      </section>`;
  }

  function textBlock(title, value) {
    if (!value) return "";
    return `
      <section class="ai-explanation-card">
        <h4>${window.escapeHtml(title)}</h4>
        <p>${window.escapeHtml(value)}</p>
      </section>`;
  }

  function explanationHtml(aiExplanation) {
    if (!aiExplanation || aiExplanation.status === "not_requested") {
      return `<div class="ai-explanation empty-state">AI explanation has not been requested.</div>`;
    }
    if (aiExplanation.status === "error") {
      const details = aiExplanation.content?.providerMessage
        ? `<pre class="ai-provider-message">${window.escapeHtml(aiExplanation.content.providerMessage)}</pre>`
        : "";
      return `
        <div class="ai-explanation ai-explanation-error">
          <section class="ai-explanation-card">
            <h4>External AI Unavailable</h4>
            <p>${window.escapeHtml(aiExplanation.error || "AI explanation failed.")}</p>
            ${details}
          </section>
          <p class="muted-note">The Random Forest detection and local alert data are still available; only the external AI explanation failed.</p>
        </div>`;
    }
    const content = aiExplanation.content || {};
    if (content.rawText) {
      return `<div class="ai-explanation"><pre>${window.escapeHtml(content.rawText)}</pre></div>`;
    }
    return `
      <div class="ai-explanation">
        ${content.title ? `<div class="ai-explanation-title">${window.escapeHtml(content.title)}</div>` : ""}
        ${content.summary ? `<p class="ai-explanation-summary">${window.escapeHtml(content.summary)}</p>` : ""}
        ${textBlock("What it means", content.what_it_means)}
        ${listBlock("Why the model flagged it", content.why_the_model_flagged_it)}
        ${listBlock("False positives", content.possible_false_positives)}
        ${listBlock("Immediate actions", content.immediate_actions)}
        ${listBlock("Mitigations", content.mitigations)}
        ${listBlock("SIEM correlation", content.siem_correlation)}
        ${textBlock("Analyst note", content.analyst_note)}
        ${textBlock("Confidence caution", content.confidence_caution)}
      </div>`;
  }

  function showDetails(alert) {
    const details = document.getElementById("alertDetails");
    const content = document.getElementById("alertDetailsContent");
    content.innerHTML = `
      <div class="detail-section">
        <h2>${window.escapeHtml(alert.ml?.prediction || "Alert")}</h2>
        <p>${window.escapeHtml(alert.threat?.description || "")}</p>
      </div>
      <div class="detail-section">
        <h3>Network</h3>
        <pre>${window.escapeHtml(
          JSON.stringify(
            {
              source: visibleEndpoint(alert.source),
              destination: visibleEndpoint(alert.destination),
              network: alert.network,
              sourceType: alert.sourceType,
              sessionId: alert.sessionId
            },
            null,
            2
          )
        )}</pre>
      </div>
      <div class="detail-section">
        <h3>ML</h3>
        <pre>${window.escapeHtml(
          JSON.stringify(
            {
              prediction: alert.ml?.prediction,
              confidence: alert.ml?.confidence,
              probabilities: alert.ml?.probabilities,
              topFeatures: alert.ml?.topFeatures,
              featureValues: alert.ml?.featureValues,
              modelVersion: alert.ml?.modelVersion
            },
            null,
            2
          )
        )}</pre>
      </div>
      <div class="detail-section">
        <h3>AI Explanation</h3>
        ${explanationHtml(alert.aiExplanation)}
      </div>`;
    details.classList.add("open");
  }

  async function handleAction(action, id, button) {
    const originalText = button?.textContent;
    try {
      if (action === "details") {
        const payload = await window.API.getAlert(id);
        showDetails(payload.alert);
      } else if (action === "explain") {
        if (button) {
          button.disabled = true;
          button.textContent = "Explaining...";
        }
        const payload = await window.API.explainAlert(id);
        const alertPayload = await window.API.getAlert(id);
        showDetails(alertPayload.alert);
        if (payload.error) window.alert(payload.error);
      } else if (["reviewed", "confirmed", "false_positive"].includes(action)) {
        await window.API.updateAlert(id, action);
        await applyFilters();
      } else if (action === "export") {
        const payload = await window.API.exportAlert(id);
        window.alert(`Exported to ${payload.filePath}`);
      }
    } catch (error) {
      if (action === "explain") {
        try {
          const alertPayload = await window.API.getAlert(id);
          showDetails(alertPayload.alert);
        } catch (_ignored) {
          // Keep the original error below if the refresh also fails.
        }
      }
      window.alert(error.payload?.error || error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function exportFiltered() {
    try {
      const payload = await window.API.exportFilteredAlerts(filtersFromUI());
      window.alert(`Exported ${payload.count} alert(s) to ${payload.filePath}`);
    } catch (error) {
      window.alert(error.message);
    }
  }

  function render(alerts) {
    renderFilters(alerts);
    renderTable("alertsTable", alerts || []);
  }

  function bind() {
    document.getElementById("applyAlertFilters").addEventListener("click", applyFilters);
    document.getElementById("exportFilteredAlerts").addEventListener("click", exportFiltered);
    document.getElementById("alertsTable").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      handleAction(button.dataset.action, button.dataset.id, button);
    });
  }

  window.Alerts = {
    bind,
    render,
    renderTable,
    handleAction
  };
})();
