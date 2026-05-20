const { execFile, spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const env = require("../config/env");
const logger = require("../utils/logger");

let captureProcess = null;
let captureState = {
  running: false,
  sessionId: null,
  interfaceName: "",
  captureFilter: "",
  startedAt: null,
  lastEventAt: null,
  error: null
};

function scriptPath(scriptName) {
  return path.join(env.pythonMlServiceDir, scriptName);
}

function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.pythonExecutable, args, {
      cwd: env.pythonMlServiceDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error(`Python command timed out after ${options.timeoutMs || 120000}ms`);
      error.stderr = stderr;
      reject(error);
    }, options.timeoutMs || 120000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(stderr.trim() || `Python command exited with code ${code}`);
        error.code = code;
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    throw new Error("Python command returned empty output");
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch (_ignored) {
        // Continue looking for the final JSON line.
      }
    }
    throw new Error(`Python command returned invalid JSON: ${error.message}`);
  }
}

async function runJsonScript(scriptName, args = [], options = {}) {
  const result = await runCommand([scriptPath(scriptName), ...args], options);
  return parseJsonOutput(result.stdout);
}

function resolveWorkspacePath(inputPath, fallback) {
  const candidate = path.resolve(env.projectRoot, inputPath || fallback);
  const allowExternal = String(process.env.ALLOW_EXTERNAL_DATASET_PATHS || "").toLowerCase() === "true";
  if (!allowExternal && !candidate.startsWith(env.projectRoot)) {
    const error = new Error("Path must stay inside the project workspace unless ALLOW_EXTERNAL_DATASET_PATHS=true");
    error.status = 400;
    throw error;
  }
  return candidate;
}

async function health() {
  const python = await new Promise((resolve) => {
    execFile(env.pythonExecutable, ["--version"], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: error.message });
      } else {
        resolve({ ok: true, version: (stdout || stderr).trim() });
      }
    });
  });

  const modelInfo = await getModelInfo();
  return {
    ok: python.ok,
    python,
    serviceDir: env.pythonMlServiceDir,
    modelLoaded: Boolean(modelInfo?.model?.loaded),
    model: modelInfo?.model || null
  };
}

async function getModelInfo() {
  const metadataPath = path.join(env.pythonMlServiceDir, "models", "model_metadata.json");
  const legacyModelPath = path.join(env.projectRoot, "backend", "model.pkl");
  const legacyScalerPath = path.join(env.projectRoot, "backend", "scaler.pkl");

  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    return {
      model: {
        loaded: true,
        name: metadata.modelName || "RandomForest_IDS",
        version: metadata.modelVersion || "unknown",
        supportedClasses: metadata.supportedClasses || [],
        legacy: Boolean(metadata.legacy)
      },
      metadata
    };
  } catch (_error) {
    try {
      await fs.access(legacyModelPath);
      await fs.access(legacyScalerPath);
      return {
        model: {
          loaded: true,
          name: "Legacy_Binary_RandomForest_IDS",
          version: "legacy-binary",
          supportedClasses: ["BENIGN", "DDoS"],
          legacy: true
        },
        metadata: {
          modelName: "Legacy_Binary_RandomForest_IDS",
          modelVersion: "legacy-binary",
          supportedClasses: ["BENIGN", "DDoS"],
          features: [
            "Flow Duration",
            "Total Fwd Packets",
            "Flow IAT Mean",
            "Flow IAT Std",
            "Packet Length Mean",
            "Packet Length Std",
            "Flow Bytes/s",
            "Flow Packets/s"
          ],
          notes:
            "Legacy Flask prototype model found. It is binary only and was trained with DDoS-vs-BENIGN label collapsing. Train a new multiclass model to replace it."
        }
      };
    } catch (_legacyError) {
      return {
        model: {
          loaded: false,
          name: "RandomForest_IDS",
          version: "missing",
          supportedClasses: [],
          legacy: false
        },
        metadata: {
          notes: "No model artifact found. Place CICIDS/CSE-CIC-IDS CSV files in ml_service/data/raw and run model training."
        }
      };
    }
  }
}

async function getModelHistory() {
  const historyPath = path.join(env.pythonMlServiceDir, "models", "model_history.json");
  try {
    const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
    return Array.isArray(history) ? history : history.runs || [];
  } catch (_error) {
    return [];
  }
}

async function isFreshArtifact(outputPath, inputPath) {
  try {
    const [outputStat, inputStat] = await Promise.all([fs.stat(outputPath), fs.stat(inputPath)]);
    return outputStat.mtimeMs >= inputStat.mtimeMs;
  } catch (_error) {
    return false;
  }
}

function normalizeTreeDepth(maxDepth) {
  const normalized = String(maxDepth || "3").trim().toLowerCase();
  if (["full", "none", "all", "unlimited"].includes(normalized)) return "full";
  const parsed = Number.parseInt(normalized, 10);
  return String(Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 8)) : 3);
}

async function getCachedTreePreviewPath() {
  const preferred = path.join(env.pythonMlServiceDir, "models", "tree_graph_depth_3.png");
  const legacy = path.join(env.pythonMlServiceDir, "models", "tree_graph.png");
  try {
    await fs.access(preferred);
    return preferred;
  } catch (_error) {
    try {
      await fs.access(legacy);
      return legacy;
    } catch (_legacyError) {
      return null;
    }
  }
}

async function renderTreeGraph(options = {}) {
  const depth = normalizeTreeDepth(options.maxDepth);
  const outputName = depth === "full" ? "tree_graph_full.png" : `tree_graph_depth_${depth}.png`;
  const outputPath = path.join(env.pythonMlServiceDir, "models", outputName);
  const modelPath = path.join(env.pythonMlServiceDir, "models", "random_forest_multiclass.joblib");
  const metadataPath = path.join(env.pythonMlServiceDir, "models", "model_metadata.json");
  if (depth === "3") {
    const cachedPreview = await getCachedTreePreviewPath();
    if (cachedPreview) return cachedPreview;
  }
  if (await isFreshArtifact(outputPath, modelPath)) {
    return outputPath;
  }
  await runJsonScript(
    "render_tree_graph.py",
    ["--model", modelPath, "--metadata", metadataPath, "--output", outputPath, "--max-depth", depth],
    { timeoutMs: depth === "full" ? 10 * 60 * 1000 : 120000 }
  );
  return outputPath;
}

async function exportTreeText() {
  const outputPath = path.join(env.pythonMlServiceDir, "models", "tree_0_full.txt");
  const modelPath = path.join(env.pythonMlServiceDir, "models", "random_forest_multiclass.joblib");
  const metadataPath = path.join(env.pythonMlServiceDir, "models", "model_metadata.json");
  if (await isFreshArtifact(outputPath, modelPath)) {
    return outputPath;
  }
  await runJsonScript(
    "export_tree_text.py",
    ["--model", modelPath, "--metadata", metadataPath, "--output", outputPath],
    { timeoutMs: 10 * 60 * 1000 }
  );
  return outputPath;
}

async function analyzeCsv(filePath) {
  return runJsonScript("predict_csv.py", ["--input", filePath], { timeoutMs: 180000 });
}

async function analyzePcap(filePath) {
  return runJsonScript("predict_pcap.py", ["--input", filePath], { timeoutMs: 180000 });
}

async function listCaptureInterfaces() {
  return runJsonScript("capture_worker.py", ["--list-interfaces"], { timeoutMs: 30000 });
}

async function trainModel({
  dataDir,
  labelMode = "grouped",
  outputDir,
  loadingMode,
  chunksize,
  maxRowsPerClass,
  maxTotalRows,
  maxRowsPerFile,
  nEstimators,
  randomState
} = {}) {
  const safeDataDir = resolveWorkspacePath(
    dataDir,
    process.env.ML_TRAIN_DATA_DIR || "ml_service/data/raw/cse_cic_ids2018_processed"
  );
  const safeOutputDir = resolveWorkspacePath(outputDir, process.env.ML_TRAIN_OUTPUT_DIR || "ml_service/models");
  const args = ["--data-dir", safeDataDir, "--label-mode", labelMode, "--output-dir", safeOutputDir];
  if (loadingMode) args.push("--loading-mode", String(loadingMode));
  if (chunksize) args.push("--chunksize", String(chunksize));
  if (maxRowsPerClass !== undefined) args.push("--max-rows-per-class", String(maxRowsPerClass));
  if (maxTotalRows !== undefined) args.push("--max-total-rows", String(maxTotalRows));
  if (maxRowsPerFile !== undefined) args.push("--max-rows-per-file", String(maxRowsPerFile));
  if (nEstimators) args.push("--n-estimators", String(nEstimators));
  if (randomState) args.push("--random-state", String(randomState));
  return runJsonScript(
    "train_multiclass.py",
    args,
    { timeoutMs: 30 * 60 * 1000 }
  );
}

function startCapture(options, onEvent) {
  if (captureProcess) {
    const error = new Error("Live capture is already running");
    error.status = 409;
    throw error;
  }

  const args = [
    scriptPath("capture_worker.py"),
    "--window-seconds",
    String(options.windowSeconds || env.captureWindowSeconds),
    "--session-id",
    options.sessionId
  ];
  if (options.interfaceName) {
    args.push("--interface", options.interfaceName);
  }
  if (options.captureFilter) {
    args.push("--filter", options.captureFilter);
  }
  if (options.dosFlowThreshold) {
    args.push("--dos-flow-threshold", String(options.dosFlowThreshold));
  }
  if (options.dosFlowRateThreshold) {
    args.push("--dos-flow-rate-threshold", String(options.dosFlowRateThreshold));
  }
  if (options.dosSynThreshold) {
    args.push("--dos-syn-threshold", String(options.dosSynThreshold));
  }
  if (options.dosSynRateThreshold) {
    args.push("--dos-syn-rate-threshold", String(options.dosSynRateThreshold));
  }

  captureProcess = spawn(env.pythonExecutable, args, {
    cwd: env.pythonMlServiceDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  captureState = {
    running: true,
    sessionId: options.sessionId,
    interfaceName: options.interfaceName || "",
    captureFilter: options.captureFilter || "",
    startedAt: new Date().toISOString(),
    lastEventAt: null,
    error: null
  };

  let buffer = "";
  captureProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        captureState.lastEventAt = new Date().toISOString();
        onEvent(event);
      } catch (error) {
        logger.warn("Failed to parse capture worker JSON line", { line, error: error.message });
      }
    }
  });

  captureProcess.stderr.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      if (/Unable to guess datalink type/i.test(message)) {
        logger.debug("suppressed capture_worker datalink warning", { message });
        return;
      }
      logger.warn("capture_worker stderr", { message });
    }
  });

  captureProcess.on("error", (error) => {
    captureState.error = error.message;
    captureState.running = false;
    onEvent({ type: "error", message: error.message, session_id: options.sessionId });
  });

  captureProcess.on("close", (code) => {
    captureState.running = false;
    const sessionId = captureState.sessionId;
    captureProcess = null;
    onEvent({
      type: "capture_status",
      status: code === 0 ? "stopped" : "error",
      code,
      session_id: sessionId,
      timestamp: new Date().toISOString()
    });
  });

  return captureState;
}

function stopCapture() {
  if (!captureProcess) {
    return { running: false, message: "No capture worker is running" };
  }
  captureProcess.kill();
  return { running: false, message: "Stop signal sent", sessionId: captureState.sessionId };
}

function getCaptureStatus() {
  return captureState;
}

module.exports = {
  parseJsonOutput,
  health,
  getModelInfo,
  getModelHistory,
  getCachedTreePreviewPath,
  renderTreeGraph,
  exportTreeText,
  analyzeCsv,
  analyzePcap,
  listCaptureInterfaces,
  trainModel,
  startCapture,
  stopCapture,
  getCaptureStatus
};
