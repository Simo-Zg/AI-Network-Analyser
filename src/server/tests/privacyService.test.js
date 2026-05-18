const privacyService = require("../services/privacyService");

test("redacted mode replaces internal and external IPs with stable aliases", () => {
  const alert = {
    eventId: "evt_test",
    source: { ip: "192.168.1.10", port: 51522 },
    destination: { ip: "203.0.113.10", port: 443 },
    network: { protocol: "TCP" },
    ml: { prediction: "DDoS", confidence: 0.97 },
    threat: { severity: "High" },
    sourceType: "csv"
  };

  const sanitized = privacyService.sanitizeAlertForAI(alert, "redacted");
  expect(sanitized.source.ip).toBe("internal_host_1");
  expect(sanitized.destination.ip).toBe("external_ip_1");
  expect(JSON.stringify(sanitized)).not.toContain("192.168.1.10");
  expect(JSON.stringify(sanitized)).not.toContain("203.0.113.10");
});

test("strict mode removes IPs and ports from AI prompt context", () => {
  const alert = {
    eventId: "evt_test",
    source: { ip: "10.0.0.5", port: 1234 },
    destination: { ip: "8.8.8.8", port: 53 },
    network: { protocol: "UDP" },
    ml: { prediction: "PortScan", confidence: 0.8 },
    threat: { severity: "Medium" },
    sourceType: "csv"
  };

  const sanitized = privacyService.sanitizeAlertForAI(alert, "strict");
  expect(sanitized.source.ip).toBeNull();
  expect(sanitized.source.port).toBeNull();
  expect(sanitized.destination.ip).toBeNull();
  expect(sanitized.destination.port).toBeNull();
});
