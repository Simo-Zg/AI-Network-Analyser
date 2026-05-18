const express = require("express");
const env = require("../config/env");
const AppSetting = require("../models/AppSetting");

const router = express.Router();

const allowedKeys = [
  "openRouterModel",
  "aiPrivacyMode",
  "captureWindowSeconds",
  "captureInterface",
  "siemExportDir",
  "aiExplanationEnabled"
];

function defaultSettings() {
  return {
    openRouterModel: env.openRouterModel,
    aiPrivacyMode: env.aiPrivacyMode,
    captureWindowSeconds: env.captureWindowSeconds,
    captureInterface: env.captureInterface,
    siemExportDir: env.siemExportDir,
    aiExplanationEnabled: env.aiExplanationEnabled,
    openRouterConfigured: Boolean(env.openRouterApiKey)
  };
}

router.get("/", async (req, res) => {
  const settings = defaultSettings();
  try {
    const stored = await AppSetting.find().lean();
    for (const item of stored) settings[item.key] = item.value;
  } catch (_error) {
    // Environment defaults are enough when MongoDB is unavailable.
  }
  res.json({ settings });
});

router.post("/", async (req, res, next) => {
  try {
    const updates = Object.entries(req.body || {}).filter(([key]) => allowedKeys.includes(key));
    for (const [key, value] of updates) {
      await AppSetting.findOneAndUpdate(
        { key },
        { key, value, updatedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    const stored = await AppSetting.find().lean();
    const settings = defaultSettings();
    for (const item of stored) settings[item.key] = item.value;
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
