const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  projectRoot,
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseNumber(process.env.PORT, 3000),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/ai_network_analyzer",
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openRouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  aiExplanationEnabled: parseBoolean(process.env.AI_EXPLANATION_ENABLED, false),
  aiPrivacyMode: process.env.AI_PRIVACY_MODE || "redacted",
  pythonExecutable: process.env.PYTHON_EXECUTABLE || "python",
  pythonMlServiceDir: path.resolve(projectRoot, process.env.PYTHON_ML_SERVICE_DIR || "./ml_service"),
  captureWindowSeconds: parseNumber(process.env.CAPTURE_WINDOW_SECONDS, 5),
  captureInterface: process.env.CAPTURE_INTERFACE || "",
  siemExportDir: path.resolve(projectRoot, process.env.SIEM_EXPORT_DIR || "./exports"),
  uploadDir: path.resolve(projectRoot, "uploads")
};

module.exports = env;
