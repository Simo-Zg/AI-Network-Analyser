const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const http = require("http");
const { fileURLToPath } = require("url");
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
  if (process.env.AI_NETWORK_ANALYZER_EXTERNAL_API === "true") {
    logger.info("Electron using external API server; embedded API startup skipped");
    return;
  }
  const alreadyRunning = await healthCheck();
  if (alreadyRunning) return;
  apiServer = await startServer();
}

function truncate(text, max = 42) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function copyImage(params) {
  if (!params.srcURL) return;
  if (params.srcURL.startsWith("data:image")) {
    const image = nativeImage.createFromDataURL(params.srcURL);
    if (!image.isEmpty()) clipboard.writeImage(image);
    return;
  }
  if (params.srcURL.startsWith("file://")) {
    const image = nativeImage.createFromPath(fileURLToPath(params.srcURL));
    if (!image.isEmpty()) clipboard.writeImage(image);
  }
}

function saveImageAs(win, srcURL) {
  if (!srcURL) return;
  if (srcURL.startsWith("data:image")) {
    const image = nativeImage.createFromDataURL(srcURL);
    if (image.isEmpty()) return;
    dialog
      .showSaveDialog(win, {
        title: "Save Image As",
        defaultPath: "image.png",
        filters: [{ name: "PNG Image", extensions: ["png"] }]
      })
      .then((result) => {
        if (!result.canceled && result.filePath) {
          require("fs").writeFileSync(result.filePath, image.toPNG());
        }
      });
    return;
  }
  win.webContents.downloadURL(srcURL);
}

function buildContextMenu(win, params) {
  const template = [];

  if (params.isEditable) {
    if (params.misspelledWord && params.dictionarySuggestions?.length) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        });
      }
      template.push({ type: "separator" });
    }

    template.push(
      { label: "Undo", role: "undo", enabled: params.editFlags.canUndo },
      { label: "Redo", role: "redo", enabled: params.editFlags.canRedo },
      { type: "separator" },
      { label: "Cut", role: "cut", enabled: params.editFlags.canCut },
      { label: "Copy", role: "copy", enabled: params.editFlags.canCopy },
      { label: "Paste", role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { label: "Select All", role: "selectAll", enabled: params.editFlags.canSelectAll }
    );
    return Menu.buildFromTemplate(template);
  }

  if (params.linkURL) {
    template.push(
      { label: "Open Link", click: () => shell.openExternal(params.linkURL) },
      { label: "Copy Link Address", click: () => clipboard.writeText(params.linkURL) }
    );
  }

  if (params.mediaType === "image" && params.srcURL) {
    if (template.length) template.push({ type: "separator" });
    template.push(
      { label: "Copy Image", click: () => copyImage(params) },
      { label: "Copy Image Address", click: () => clipboard.writeText(params.srcURL) },
      { label: "Save Image As...", click: () => saveImageAs(win, params.srcURL) }
    );
  }

  if (params.selectionText) {
    if (template.length) template.push({ type: "separator" });
    template.push(
      { label: "Copy", role: "copy" },
      {
        label: `Search AI Network Analyzer for "${truncate(params.selectionText)}"`,
        click: () =>
          shell.openExternal(
            `https://www.google.com/search?q=${encodeURIComponent(`AI Network Analyzer ${params.selectionText}`)}`
          )
      }
    );
  }

  if (process.env.NODE_ENV !== "production") {
    if (template.length) template.push({ type: "separator" });
    if (win.webContents.canGoBack()) template.push({ label: "Back", click: () => win.webContents.goBack() });
    if (win.webContents.canGoForward()) template.push({ label: "Forward", click: () => win.webContents.goForward() });
    template.push(
      { label: "Reload", role: "reload" },
      { label: "Inspect Element", click: () => win.webContents.inspectElement(params.x, params.y) }
    );
  }

  return template.length ? Menu.buildFromTemplate(template) : null;
}

function createWindow() {
  const iconPath = path.join(env.projectRoot, "app-icon.png");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#121212",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      sandbox: true
    }
  });

  win.setMenu(null);
  win.webContents.on("context-menu", (_event, params) => {
    const menu = buildContextMenu(win, params);
    if (menu) menu.popup({ window: win });
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("app:get-zoom-level", (event) => {
  const win = event.sender.getOwnerBrowserWindow();
  return Math.round((win?.webContents.getZoomFactor() || 1) * 100);
});

ipcMain.handle("app:set-zoom-level", (event, zoomLevel) => {
  const win = event.sender.getOwnerBrowserWindow();
  if (!win) return 100;
  const safeZoom = Math.max(50, Math.min(Number(zoomLevel) || 100, 200));
  win.webContents.setZoomFactor(safeZoom / 100);
  return Math.round(win.webContents.getZoomFactor() * 100);
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
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
