const express = require("express");
const env = require("../config/env");
const { mongoose } = require("../config/database");
const AppSetting = require("../models/AppSetting");

const router = express.Router();
let memorySettings = {};

const allowedKeys = [
  "aiPrivacyMode",
  "captureWindowSeconds",
  "captureInterface",
  "siemExportDir",
  "aiExplanationEnabled",
  "theme",
  "zoomLevel",
  "systemNotificationsEnabled",
  "notifyHighSeverityOnly"
];

function defaultSettings() {
  return {
    openRouterModel: env.openRouterModel,
    aiPrivacyMode: env.aiPrivacyMode,
    captureWindowSeconds: env.captureWindowSeconds,
    captureInterface: env.captureInterface,
    siemExportDir: env.siemExportDir,
    aiExplanationEnabled: env.aiExplanationEnabled,
    theme: "dark",
    zoomLevel: 100,
    systemNotificationsEnabled: false,
    notifyHighSeverityOnly: true,
    openRouterConfigured: Boolean(env.openRouterApiKey)
  };
}

function applyStoredSettings(settings, stored) {
  for (const item of stored) {
    if (item.key === "openRouterModel") continue;
    settings[item.key] = item.value;
  }
  return settings;
}

function filterAllowedSettings(body) {
  return Object.entries(body || {}).filter(([key]) => allowedKeys.includes(key));
}

router.get("/", async (req, res) => {
  const settings = defaultSettings();
  Object.assign(settings, memorySettings);
  try {
    if (mongoose.connection.readyState === 1) {
      const stored = await AppSetting.find().lean();
      applyStoredSettings(settings, stored);
    }
  } catch (_error) {
    // Environment defaults are enough when MongoDB is unavailable.
  }
  res.json({ settings });
});

router.post("/", async (req, res, next) => {
  try {
    const updates = filterAllowedSettings(req.body);
    for (const [key, value] of updates) {
      memorySettings[key] = value;
    }

    const settings = defaultSettings();
    Object.assign(settings, memorySettings);

    if (mongoose.connection.readyState === 1) {
      for (const [key, value] of updates) {
        await AppSetting.findOneAndUpdate(
          { key },
          { key, value, updatedAt: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      const stored = await AppSetting.find().lean();
      applyStoredSettings(settings, stored);
    }
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
