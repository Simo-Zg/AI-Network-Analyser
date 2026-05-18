(function () {
  const baseUrl = window.aiNetworkAnalyzer?.apiBaseUrl || "http://127.0.0.1:3000";

  async function request(path, options = {}) {
    const fetchOptions = {
      method: options.method || "GET",
      headers: options.headers || {}
    };

    if (options.body !== undefined) {
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    if (options.formData) {
      fetchOptions.body = options.formData;
    }

    const response = await fetch(`${baseUrl}${path}`, fetchOptions);
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      payload = { raw: text };
    }

    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with status ${response.status}`);
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function queryString(filters) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  window.API = {
    baseUrl,
    health: () => request("/api/health"),
    modelInfo: () => request("/api/model/info"),
    modelHistory: () => request("/api/model/history"),
    getAlerts: (filters) => request(`/api/alerts${queryString(filters)}`),
    getAlert: (id) => request(`/api/alerts/${encodeURIComponent(id)}`),
    updateAlert: (id, status) =>
      request(`/api/alerts/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }),
    explainAlert: (id, body = {}) =>
      request(`/api/alerts/${encodeURIComponent(id)}/explain`, { method: "POST", body }),
    exportAlert: (id) => request(`/api/alerts/${encodeURIComponent(id)}/export`, { method: "POST" }),
    exportFilteredAlerts: (filters) => request("/api/siem/export", { method: "POST", body: { filters } }),
    analyzeCsv: (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return request("/api/analyze/csv", { method: "POST", formData });
    },
    analyzePcap: (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return request("/api/analyze/pcap", { method: "POST", formData });
    },
    getBatches: () => request("/api/analyze/batches"),
    startCapture: (body) => request("/api/capture/start", { method: "POST", body }),
    stopCapture: () => request("/api/capture/stop", { method: "POST" }),
    captureStatus: () => request("/api/capture/status"),
    captureSessions: () => request("/api/capture/sessions"),
    getSettings: () => request("/api/settings"),
    saveSettings: (body) => request("/api/settings", { method: "POST", body })
  };
})();
