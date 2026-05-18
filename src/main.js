const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const env = require("./server/config/env");
const { startServer } = require("./server");
const logger = require("./server/utils/logger");

let apiServer = null;

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${env.port}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureApiServer() {
  const alreadyRunning = await healthCheck();
  if (alreadyRunning) return;
  apiServer = await startServer();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#08111f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  try {
    await ensureApiServer();
  } catch (error) {
    logger.warn("Electron started without launching an embedded API server", { error: error.message });
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (apiServer) apiServer.close();
    app.quit();
  }
});
