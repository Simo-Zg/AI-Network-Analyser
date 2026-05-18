const net = require("net");

function parseIPv4(ip) {
  if (!ip || net.isIP(ip) !== 4) return null;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function isPrivateIPv4(ip) {
  const parts = parseIPv4(ip);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254)
  );
}

function endpointType(ip) {
  if (!ip) return "unknown";
  if (net.isIP(ip) === 0) return "unknown";
  return isPrivateIPv4(ip) ? "internal" : "external";
}

function redactIp(ip, type, counters) {
  const resolvedType = type || endpointType(ip);
  if (!ip) return "unknown_host";

  if (!counters.map.has(ip)) {
    if (resolvedType === "internal") {
      counters.internal += 1;
      counters.map.set(ip, `internal_host_${counters.internal}`);
    } else if (resolvedType === "external") {
      counters.external += 1;
      counters.map.set(ip, `external_ip_${counters.external}`);
    } else {
      counters.unknown += 1;
      counters.map.set(ip, `unknown_host_${counters.unknown}`);
    }
  }

  return counters.map.get(ip);
}

function normalizeEndpoint(endpoint = {}, mode, counters) {
  const type = endpoint.type || endpointType(endpoint.ip);
  if (mode === "lab") {
    return {
      ip: endpoint.ip || null,
      port: endpoint.port ?? null,
      type
    };
  }
  if (mode === "strict") {
    return {
      ip: null,
      port: null,
      type
    };
  }
  return {
    ip: endpoint.redactedIp || redactIp(endpoint.ip, type, counters),
    port: endpoint.port ?? null,
    type
  };
}

function sanitizeAlertForAI(alert, mode = "redacted") {
  const counters = { internal: 0, external: 0, unknown: 0, map: new Map() };
  const raw = typeof alert.toObject === "function" ? alert.toObject() : alert;
  const privacyMode = mode === "lab" || mode === "strict" ? mode : "redacted";

  return {
    event_id: raw.eventId,
    timestamp: raw.timestamp,
    source: normalizeEndpoint(raw.source, privacyMode, counters),
    destination: normalizeEndpoint(raw.destination, privacyMode, counters),
    network: {
      protocol: raw.network?.protocol,
      direction: raw.network?.direction,
      packet_count: raw.network?.packetCount,
      byte_count: raw.network?.byteCount,
      duration_ms: raw.network?.durationMs
    },
    ml: {
      model_name: raw.ml?.modelName,
      model_version: raw.ml?.modelVersion,
      prediction: raw.ml?.prediction,
      confidence: raw.ml?.confidence,
      probabilities: raw.ml?.probabilities,
      top_features: raw.ml?.topFeatures,
      feature_values: raw.ml?.featureValues
    },
    threat: raw.threat,
    source_type: raw.sourceType,
    privacy_mode: privacyMode
  };
}

function redactedEndpoint(endpoint = {}, counters = { internal: 0, external: 0, unknown: 0, map: new Map() }) {
  const type = endpoint.type || endpointType(endpoint.ip);
  return {
    ...endpoint,
    type,
    redactedIp: endpoint.redactedIp || redactIp(endpoint.ip, type, counters)
  };
}

module.exports = {
  endpointType,
  isPrivateIPv4,
  redactIp,
  redactedEndpoint,
  sanitizeAlertForAI
};
