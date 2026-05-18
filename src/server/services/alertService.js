const Alert = require("../models/Alert");
const PredictionBatch = require("../models/PredictionBatch");
const CaptureSession = require("../models/CaptureSession");
const privacyService = require("./privacyService");
const { makeAlertId, makeBatchId } = require("../utils/ids");

const categoryByPrediction = [
  { test: /ddos|dos/i, category: "Denial of Service", tactic: "Impact", technique: "Distributed Denial of Service" },
  { test: /portscan|scan/i, category: "Reconnaissance", tactic: "Discovery", technique: "Network Service Scanning" },
  { test: /bot/i, category: "Botnet", tactic: "Command and Control", technique: "Botnet Activity" },
  { test: /patator|brute/i, category: "Credential Attack", tactic: "Credential Access", technique: "Brute Force" },
  { test: /web attack|xss|sql/i, category: "Web Attack", tactic: "Initial Access", technique: "Exploit Public-Facing Application" },
  { test: /infiltration/i, category: "Infiltration", tactic: "Exfiltration", technique: "Exfiltration Over Network" },
  { test: /heartbleed/i, category: "Exploit", tactic: "Initial Access", technique: "Heartbleed" }
];

function severityForPrediction(prediction, confidence = 0) {
  const label = String(prediction || "");
  if (/heartbleed|infiltration/i.test(label)) return "Critical";
  if (/ddos|dos|bot/i.test(label)) return confidence >= 0.85 ? "Critical" : "High";
  if (/portscan|patator|brute|web attack|xss|sql/i.test(label)) return "High";
  return confidence >= 0.9 ? "High" : "Medium";
}

function threatForPrediction(prediction, confidence) {
  const match = categoryByPrediction.find((entry) => entry.test.test(String(prediction || "")));
  return {
    category: match?.category || "Anomalous Network Flow",
    severity: severityForPrediction(prediction, confidence),
    mitreTactic: match?.tactic || "Unknown",
    mitreTechnique: match?.technique || String(prediction || "Unknown"),
    description: `Flow classified as ${prediction || "unknown"} by the current IDS model.`
  };
}

function normalizeAlertFromPython(alert, sourceType, model, context = {}) {
  const counters = { internal: 0, external: 0, unknown: 0, map: new Map() };
  const confidence = Number(alert.ml?.confidence ?? alert.confidence ?? 0);
  const prediction = alert.ml?.prediction || alert.prediction || "Unknown";
  const source = privacyService.redactedEndpoint(alert.source || {}, counters);
  const destination = privacyService.redactedEndpoint(alert.destination || {}, counters);

  return {
    eventId: alert.event_id || alert.eventId || makeAlertId(),
    timestamp: alert.timestamp ? new Date(alert.timestamp) : new Date(),
    source,
    destination,
    network: {
      protocol: alert.network?.protocol || "unknown",
      direction: alert.network?.direction || "unknown",
      flowId: alert.network?.flow_id || alert.network?.flowId,
      packetCount: alert.network?.packet_count ?? alert.network?.packetCount,
      byteCount: alert.network?.byte_count ?? alert.network?.byteCount,
      durationMs: alert.network?.duration_ms ?? alert.network?.durationMs
    },
    ml: {
      modelName: alert.ml?.model_name || alert.ml?.modelName || model?.name || "RandomForest_IDS",
      modelVersion: alert.ml?.model_version || alert.ml?.modelVersion || model?.version || "unknown",
      prediction,
      confidence,
      probabilities: alert.ml?.probabilities || {},
      topFeatures: alert.ml?.top_features || alert.ml?.topFeatures || [],
      featureValues: alert.ml?.feature_values || alert.ml?.featureValues || {}
    },
    threat: alert.threat || threatForPrediction(prediction, confidence),
    aiExplanation: {
      status: "not_requested"
    },
    status: "new",
    sourceType,
    sessionId: alert.session_id || context.sessionId,
    rawRef: context.rawRef
  };
}

function buildBatchDocument(result, context = {}) {
  const summary = result.summary || {};
  return {
    batchId: result.batch_id || makeBatchId(),
    timestamp: result.timestamp ? new Date(result.timestamp) : new Date(),
    sourceType: result.source_type || context.sourceType,
    fileName: context.fileName,
    totalFlows: summary.total_flows || 0,
    benignCount: summary.benign_count || 0,
    maliciousCount: summary.malicious_count || 0,
    classDistribution: summary.class_distribution || {},
    alerts: (result.alerts || []).map((alert) => alert.event_id || alert.eventId).filter(Boolean),
    modelVersion: result.model?.version || "unknown"
  };
}

async function persistPredictionResult(result, context = {}) {
  const sourceType = result.source_type || context.sourceType || "csv";
  const alertDocs = (result.alerts || []).map((alert) =>
    normalizeAlertFromPython(alert, sourceType, result.model, context)
  );

  const savedAlerts = alertDocs.length > 0 ? await Alert.insertMany(alertDocs, { ordered: false }) : [];
  const batchDoc = buildBatchDocument(
    {
      ...result,
      alerts: alertDocs
    },
    { ...context, sourceType }
  );
  await PredictionBatch.create(batchDoc);

  if (context.sessionId && sourceType === "live") {
    await CaptureSession.updateOne(
      { sessionId: context.sessionId },
      {
        $inc: {
          flowsGenerated: result.summary?.total_flows || 0,
          alertsGenerated: alertDocs.length
        }
      }
    );
  }

  return {
    batch: batchDoc,
    alerts: savedAlerts
  };
}

function buildAlertQuery(filters = {}) {
  const query = {};
  if (filters.prediction) query["ml.prediction"] = filters.prediction;
  if (filters.severity) query["threat.severity"] = filters.severity;
  if (filters.status) query.status = filters.status;
  if (filters.sourceType) query.sourceType = filters.sourceType;
  if (filters.sessionId) query.sessionId = filters.sessionId;
  if (filters.from || filters.to) {
    query.timestamp = {};
    if (filters.from) query.timestamp.$gte = new Date(filters.from);
    if (filters.to) query.timestamp.$lte = new Date(filters.to);
  }
  return query;
}

module.exports = {
  normalizeAlertFromPython,
  persistPredictionResult,
  buildAlertQuery,
  threatForPrediction
};
