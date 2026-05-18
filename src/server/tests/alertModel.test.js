const Alert = require("../models/Alert");

test("Alert model validates a normalized IDS alert", async () => {
  const alert = new Alert({
    eventId: "evt_validation",
    source: { ip: "192.168.1.10", redactedIp: "internal_host_1", port: 1234, type: "internal" },
    destination: { ip: "203.0.113.10", redactedIp: "external_ip_1", port: 80, type: "external" },
    network: { protocol: "TCP", flowId: "flow_1", packetCount: 100, byteCount: 5000, durationMs: 250 },
    ml: {
      modelName: "RandomForest_IDS",
      modelVersion: "test",
      prediction: "DDoS",
      confidence: 0.9,
      probabilities: { BENIGN: 0.1, DDoS: 0.9 },
      topFeatures: ["Flow Packets/s"],
      featureValues: { "Flow Packets/s": 400 }
    },
    threat: { category: "Denial of Service", severity: "High" },
    sourceType: "csv"
  });

  await expect(alert.validate()).resolves.toBeUndefined();
});
