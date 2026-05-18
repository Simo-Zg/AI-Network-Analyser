const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("aiNetworkAnalyzer", {
  apiBaseUrl: "http://127.0.0.1:3000"
});
