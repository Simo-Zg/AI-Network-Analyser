const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiNetworkAnalyzer", {
  apiBaseUrl: "http://127.0.0.1:3000",
  zoomControls: {
    getLevel: () => ipcRenderer.invoke("app:get-zoom-level"),
    setLevel: (zoomLevel) => ipcRenderer.invoke("app:set-zoom-level", zoomLevel)
  }
});
