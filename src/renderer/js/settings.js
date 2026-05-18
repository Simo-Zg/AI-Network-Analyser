(function () {
  function render() {
    const settings = window.AppState.settings;
    if (!settings) return;
    document.getElementById("settingModel").value = settings.openRouterModel || "";
    document.getElementById("settingPrivacy").value = settings.aiPrivacyMode || "redacted";
    document.getElementById("settingWindow").value = settings.captureWindowSeconds || 5;
    document.getElementById("settingInterface").value = settings.captureInterface || "";
    document.getElementById("settingExportDir").value = settings.siemExportDir || "";
    document.getElementById("settingAiEnabled").checked = Boolean(settings.aiExplanationEnabled);
    document.getElementById("settingsStatus").textContent = settings.openRouterConfigured
      ? "OpenRouter API key is configured in the backend environment."
      : "AI explanation unavailable: missing API key";
  }

  async function save() {
    const body = {
      openRouterModel: document.getElementById("settingModel").value.trim(),
      aiPrivacyMode: document.getElementById("settingPrivacy").value,
      captureWindowSeconds: Number(document.getElementById("settingWindow").value || 5),
      captureInterface: document.getElementById("settingInterface").value.trim(),
      siemExportDir: document.getElementById("settingExportDir").value.trim(),
      aiExplanationEnabled: document.getElementById("settingAiEnabled").checked
    };
    try {
      const payload = await window.API.saveSettings(body);
      window.AppState.settings = payload.settings;
      render();
      window.setMessage("settingsStatus", "Settings saved.", "ok");
    } catch (error) {
      window.setMessage("settingsStatus", error.message, "error");
    }
  }

  function bind() {
    document.getElementById("saveSettingsButton").addEventListener("click", save);
  }

  window.Settings = { bind, render };
})();
