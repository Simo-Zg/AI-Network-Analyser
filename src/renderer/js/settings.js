(function () {
  function zoomValue() {
    return Math.max(50, Math.min(Number(document.getElementById("settingZoomLevel").value || 100), 200));
  }

  function updateZoomLabel() {
    document.getElementById("settingZoomValue").textContent = `${zoomValue()}%`;
  }

  function render() {
    const settings = window.AppState.settings;
    if (!settings) return;
    const theme = settings.theme || localStorage.getItem("ana-theme") || "dark";
    document.getElementById("settingThemeToggle").checked = theme === "dark";
    document.getElementById("settingZoomLevel").value = settings.zoomLevel || localStorage.getItem("ana-zoom-level") || 100;
    updateZoomLabel();
    document.getElementById("settingModel").value = settings.openRouterModel || "";
    document.getElementById("settingPrivacy").value = settings.aiPrivacyMode || "redacted";
    document.getElementById("settingWindow").value = settings.captureWindowSeconds || 5;
    document.getElementById("settingInterface").value = settings.captureInterface || "";
    document.getElementById("settingExportDir").value = settings.siemExportDir || "";
    document.getElementById("settingAiEnabled").checked = Boolean(settings.aiExplanationEnabled);
    document.getElementById("settingNotificationsEnabled").checked = Boolean(settings.systemNotificationsEnabled);
    document.getElementById("settingNotifyHighSeverityOnly").checked = settings.notifyHighSeverityOnly !== false;
    document.getElementById("settingsStatus").textContent = settings.openRouterConfigured
      ? "OpenRouter API key is configured in the backend environment."
      : "AI explanation unavailable: missing API key";
  }

  async function save() {
    const saveButton = document.getElementById("saveSettingsButton");
    const body = {
      openRouterModel: document.getElementById("settingModel").value.trim(),
      aiPrivacyMode: document.getElementById("settingPrivacy").value,
      captureWindowSeconds: Number(document.getElementById("settingWindow").value || 5),
      captureInterface: document.getElementById("settingInterface").value.trim(),
      siemExportDir: document.getElementById("settingExportDir").value.trim(),
      aiExplanationEnabled: document.getElementById("settingAiEnabled").checked,
      theme: document.getElementById("settingThemeToggle").checked ? "dark" : "light",
      zoomLevel: zoomValue(),
      systemNotificationsEnabled: document.getElementById("settingNotificationsEnabled").checked,
      notifyHighSeverityOnly: document.getElementById("settingNotifyHighSeverityOnly").checked
    };
    try {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      window.applyTheme(body.theme);
      await window.applyZoom(body.zoomLevel);
      if (body.systemNotificationsEnabled && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const payload = await window.API.saveSettings(body);
      window.AppState.settings = payload.settings;
      render();
      window.setMessage("settingsStatus", "Settings saved.", "ok");
    } catch (error) {
      window.setMessage("settingsStatus", error.message, "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save Settings";
    }
  }

  function bind() {
    document.getElementById("saveSettingsButton").addEventListener("click", (event) => {
      event.preventDefault();
      save();
    });
    document.getElementById("settingThemeToggle").addEventListener("change", (event) => {
      window.applyTheme(event.target.checked ? "dark" : "light");
    });
    document.getElementById("settingZoomLevel").addEventListener("input", () => {
      updateZoomLabel();
      window.applyZoom(zoomValue());
    });
  }

  window.Settings = { bind, render };
})();
