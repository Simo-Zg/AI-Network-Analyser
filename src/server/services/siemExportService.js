const fs = require("fs/promises");
const path = require("path");
const env = require("../config/env");
const { makeExportId } = require("../utils/ids");
const AppSetting = require("../models/AppSetting");

const severityScore = {
  Low: 20,
  Medium: 50,
  High: 80,
  Critical: 95
};

function toPlain(alert) {
  return typeof alert.toObject === "function" ? alert.toObject() : alert;
}

function normalizeAlert(alert) {
  const raw = toPlain(alert);
  return {
    "@timestamp": new Date(raw.timestamp || Date.now()).toISOString(),
    "event.kind": "alert",
    "event.category": "network",
    "event.type": "ml_detection",
    "event.module": "ai-network-analyzer",
    "event.id": raw.eventId,
    "source.ip": raw.source?.redactedIp || raw.source?.ip || "unknown_host",
    "source.port": raw.source?.port ?? null,
    "destination.ip": raw.destination?.redactedIp || raw.destination?.ip || "unknown_host",
    "destination.port": raw.destination?.port ?? null,
    "network.protocol": String(raw.network?.protocol || "unknown").toLowerCase(),
    "network.direction": raw.network?.direction || "unknown",
    "network.bytes": raw.network?.byteCount ?? null,
    "network.packets": raw.network?.packetCount ?? null,
    "threat.technique.name": raw.threat?.mitreTechnique || raw.threat?.category || raw.ml?.prediction,
    "threat.tactic.name": raw.threat?.mitreTactic || null,
    "rule.name": raw.ml?.modelName || "RandomForest multiclass IDS",
    "rule.version": raw.ml?.modelVersion || null,
    "ml.prediction": raw.ml?.prediction,
    "ml.confidence": raw.ml?.confidence,
    "event.severity": severityScore[raw.threat?.severity] || 50,
    "event.outcome": raw.status || "new",
    "labels.source_type": raw.sourceType
  };
}

async function ensureExportDir() {
  let exportDir = env.siemExportDir;
  try {
    const setting = await AppSetting.findOne({ key: "siemExportDir" }).lean();
    if (setting?.value) {
      exportDir = path.resolve(env.projectRoot, String(setting.value));
    }
  } catch (_error) {
    exportDir = env.siemExportDir;
  }

  const allowExternal = String(process.env.ALLOW_EXTERNAL_EXPORT_PATHS || "").toLowerCase() === "true";
  if (!allowExternal && !exportDir.startsWith(env.projectRoot)) {
    const error = new Error("SIEM export directory must stay inside the project workspace");
    error.status = 400;
    throw error;
  }

  await fs.mkdir(exportDir, { recursive: true });
  return exportDir;
}

async function exportOne(alert) {
  const dir = await ensureExportDir();
  const filePath = path.join(dir, `${normalizeAlert(alert)["event.id"] || makeExportId()}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(normalizeAlert(alert), null, 2)}\n`, "utf8");
  return filePath;
}

async function exportJsonl(alerts) {
  const dir = await ensureExportDir();
  const filePath = path.join(dir, `${makeExportId()}.jsonl`);
  const content = alerts.map((alert) => JSON.stringify(normalizeAlert(alert))).join("\n");
  await fs.writeFile(filePath, `${content}\n`, "utf8");
  return filePath;
}

module.exports = {
  normalizeAlert,
  exportOne,
  exportJsonl
};
