(function () {
  const titles = {
    dashboard: ["Dashboard", "Flow-based ML detection, alert triage, and SIEM export."],
    live: ["Live Capture", "Windowed packet capture, flow reconstruction, and near-real-time classification."],
    csv: ["CSV Analysis", "Analyze CICFlowMeter-style network-flow feature CSV files."],
    pcap: ["PCAP Analysis", "Extract flow features from PCAP headers and classify reconstructed flows."],
    alerts: ["Alerts", "Triage model detections, request AI explanations, and export SIEM events."],
    model: ["Model Info", "Review model scope, features, metrics, and limitations."],
    settings: ["Settings", "Configure local AI, privacy, capture, and export settings."]
  };

  window.AppState = {
    health: null,
    alerts: [],
    batches: [],
    sessions: [],
    modelInfo: null,
    settings: null,
    liveAlerts: []
  };

  window.applyTheme = function applyTheme(theme) {
    const resolved = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = resolved;
    localStorage.setItem("ana-theme", resolved);
  };

  window.applyZoom = async function applyZoom(zoomLevel) {
    const safeZoom = Math.max(50, Math.min(Number(zoomLevel) || 100, 200));
    localStorage.setItem("ana-zoom-level", String(safeZoom));
    if (window.aiNetworkAnalyzer?.zoomControls) {
      return window.aiNetworkAnalyzer.zoomControls.setLevel(safeZoom);
    }
    document.documentElement.style.zoom = `${safeZoom}%`;
    return safeZoom;
  };

  window.escapeHtml = function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  window.formatDate = function formatDate(value) {
    if (!value) return "unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
  };

  window.formatPercent = function formatPercent(value) {
    const number = Number(value || 0);
    return `${Math.round(number * 1000) / 10}%`;
  };

  window.setMessage = function setMessage(id, message, tone) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.dataset.tone = tone || "";
  };

  function setPill(id, text, className) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
    element.className = `pill ${className || "muted"}`;
  }

  function setView(viewName) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === viewName);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active-view", view.id === viewName);
    });
    const [title, subtitle] = titles[viewName] || titles.dashboard;
    document.getElementById("viewTitle").textContent = title;
    document.getElementById("viewSubtitle").textContent = subtitle;
    if (viewName === "dashboard") {
      requestAnimationFrame(() => window.Dashboard.redrawCharts());
    }
  }

  function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  async function refreshHealth() {
    try {
      const health = await window.API.health();
      window.AppState.health = health;
      setPill("apiStatus", "online", "ok");
      setPill("mongoStatus", health.mongodb?.ok ? "connected" : health.mongodb?.state || "offline", health.mongodb?.ok ? "ok" : "warn");
      setPill("modelStatus", health.modelLoaded ? "loaded" : "missing", health.modelLoaded ? "ok" : "warn");
      document.getElementById("metricCapture").textContent = window.AppState.capture?.running ? "running" : "stopped";
    } catch (_error) {
      setPill("apiStatus", "offline", "error");
      setPill("mongoStatus", "unknown", "muted");
      setPill("modelStatus", "unknown", "muted");
    }
  }

  async function refreshData() {
    await refreshHealth();
    const [alertsPayload, sessionsPayload, batchesPayload, modelPayload, settingsPayload, capturePayload] = await Promise.allSettled([
      window.API.getAlerts({ limit: 250 }),
      window.API.captureSessions(),
      window.API.getBatches(),
      window.API.modelInfo(),
      window.API.getSettings(),
      window.API.captureStatus()
    ]);

    window.AppState.alerts = alertsPayload.value?.alerts || [];
    window.AppState.sessions = sessionsPayload.value?.sessions || [];
    window.AppState.batches = batchesPayload.value?.batches || [];
    window.AppState.modelInfo = modelPayload.value || null;
    window.AppState.settings = settingsPayload.value?.settings || null;
    window.AppState.capture = capturePayload.value || null;

    window.Dashboard.render();
    window.Alerts.render(window.AppState.alerts);
    window.ModelInfo.render();
    window.Settings.render();
    window.applyTheme(window.AppState.settings?.theme || localStorage.getItem("ana-theme") || "dark");
    window.applyZoom(window.AppState.settings?.zoomLevel || localStorage.getItem("ana-zoom-level") || 100);
  }

  function connectEvents() {
    const events = new EventSource(`${window.API.baseUrl}/api/events`);
    events.addEventListener("prediction_batch", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.sourceType === "live" || payload.source_type === "live") {
        window.LiveCapture.appendAlerts(payload.alerts || [], payload.summary || {});
      }
      notifyForAlerts(payload.alerts || []);
      refreshData();
    });
    events.addEventListener("capture_status", (event) => {
      window.LiveCapture.updateStatus(JSON.parse(event.data));
    });
    events.addEventListener("error", (event) => {
      if (event.data) window.LiveCapture.updateStatus(JSON.parse(event.data));
    });
  }

  async function notifyForAlerts(alerts) {
    const settings = window.AppState.settings || {};
    if (!settings.systemNotificationsEnabled || !alerts.length || !("Notification" in window)) return;

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;

    const relevant = settings.notifyHighSeverityOnly
      ? alerts.filter((alert) => ["High", "Critical"].includes(alert.threat?.severity))
      : alerts;
    if (!relevant.length) return;

    const first = relevant[0];
    const countText = relevant.length > 1 ? `${relevant.length} alerts detected` : "Network alert detected";
    new Notification(countText, {
      body: `${first.ml?.prediction || "Unknown"} | ${first.threat?.severity || "Medium"} | ${window.formatPercent(first.ml?.confidence)}`,
      silent: false
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.applyTheme(localStorage.getItem("ana-theme") || "dark");
    window.applyZoom(localStorage.getItem("ana-zoom-level") || 100);
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => setView(item.dataset.view));
    });
    document.getElementById("refreshButton").addEventListener("click", refreshData);
    document.getElementById("closeDetails").addEventListener("click", () => {
      document.getElementById("alertDetails").classList.remove("open");
    });

    window.LiveCapture.bind();
    window.CsvAnalysis.bind();
    window.PcapAnalysis.bind();
    window.Alerts.bind();
    window.Settings.bind();
    refreshData().finally(() => {
      setTimeout(hideLoading, 220);
    });
    connectEvents();
  });
})();
