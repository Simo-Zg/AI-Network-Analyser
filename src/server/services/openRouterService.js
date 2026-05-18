const axios = require("axios");
const env = require("../config/env");
const privacyService = require("./privacyService");

function responseSchemaInstruction() {
  return `Return only valid JSON with these keys:
{
  "title": "",
  "summary": "",
  "what_it_means": "",
  "why_the_model_flagged_it": [],
  "possible_false_positives": [],
  "immediate_actions": [],
  "mitigations": [],
  "siem_correlation": [],
  "analyst_note": "",
  "confidence_caution": ""
}`;
}

function buildPrompt(alert, privacyMode = env.aiPrivacyMode) {
  const sanitizedAlert = privacyService.sanitizeAlertForAI(alert, privacyMode);
  return [
    {
      role: "system",
      content:
        "You are a SOC analyst assistant. Explain ML IDS alerts without assuming the model is always correct. Do not ask for packet payloads or credentials. Use only the sanitized flow metadata provided."
    },
    {
      role: "user",
      content: [
        "Explain this network IDS alert for a student/portfolio AI Network Analyzer project.",
        "Focus on what the attack label means, why flow features may have caused the model to flag it, likely indicators, false positives, immediate checks, mitigations, SIEM correlation ideas, and containment actions.",
        "Never claim certainty from the ML result alone.",
        responseSchemaInstruction(),
        `Sanitized alert context: ${JSON.stringify(sanitizedAlert)}`
      ].join("\n\n")
    }
  ];
}

function parseJsonOrText(content) {
  const text = String(content || "").trim();
  const unfenced = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  const candidate = first >= 0 && last >= first ? unfenced.slice(first, last + 1) : unfenced;

  try {
    return {
      status: "completed",
      content: JSON.parse(candidate)
    };
  } catch (error) {
    return {
      status: "completed_with_parse_warning",
      content: {
        rawText: text,
        parseWarning: "OpenRouter response was not valid JSON and was stored as raw text."
      }
    };
  }
}

async function explainAlert(alert, options = {}) {
  const apiKey = options.apiKey ?? env.openRouterApiKey;
  const model = options.model || env.openRouterModel;
  const baseUrl = options.baseUrl || env.openRouterBaseUrl;
  const privacyMode = options.privacyMode || env.aiPrivacyMode;

  if (!apiKey) {
    const error = new Error("AI explanation unavailable: missing API key");
    error.status = 400;
    throw error;
  }

  const response = await axios.post(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      model,
      messages: buildPrompt(alert, privacyMode),
      temperature: 0.2,
      response_format: { type: "json_object" }
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Network Analyzer"
      }
    }
  );

  const text = response.data?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonOrText(text);
  return {
    ...parsed,
    provider: "OpenRouter",
    model,
    generatedAt: new Date()
  };
}

module.exports = {
  buildPrompt,
  explainAlert,
  parseJsonOrText
};
