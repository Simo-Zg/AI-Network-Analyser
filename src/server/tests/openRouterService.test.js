const openRouterService = require("../services/openRouterService");

test("OpenRouter prompt uses sanitized strict alert context", () => {
  const messages = openRouterService.buildPrompt(
    {
      eventId: "evt_test",
      source: { ip: "192.168.1.10", port: 51522 },
      destination: { ip: "203.0.113.10", port: 80 },
      network: { protocol: "TCP", packetCount: 2000 },
      ml: { prediction: "DDoS", confidence: 0.95, topFeatures: ["Flow Packets/s"] },
      threat: { severity: "High" },
      sourceType: "csv"
    },
    "strict"
  );

  const prompt = JSON.stringify(messages);
  expect(prompt).toContain("Return only valid JSON");
  expect(prompt).toContain("DDoS");
  expect(prompt).not.toContain("192.168.1.10");
  expect(prompt).not.toContain("203.0.113.10");
  expect(prompt).not.toContain("51522");
});

test("invalid OpenRouter JSON falls back to raw text", () => {
  const parsed = openRouterService.parseJsonOrText("not json");
  expect(parsed.status).toBe("completed_with_parse_warning");
  expect(parsed.content.rawText).toBe("not json");
});
