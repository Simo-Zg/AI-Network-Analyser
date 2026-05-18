const express = require("express");
const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const AppSetting = require("../models/AppSetting");
const openRouterService = require("../services/openRouterService");

const router = express.Router();

function findAlertQuery(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: id }, { eventId: id }] };
  }
  return { eventId: id };
}

async function settingValue(key, fallback) {
  try {
    const setting = await AppSetting.findOne({ key }).lean();
    return setting?.value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

router.post("/:id/explain", async (req, res, next) => {
  try {
    const alert = await Alert.findOne(findAlertQuery(req.params.id));
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    alert.aiExplanation = {
      status: "requested",
      provider: "OpenRouter",
      model: req.body.model
    };
    await alert.save();

    try {
      const model = req.body.model || (await settingValue("openRouterModel", undefined));
      const privacyMode = req.body.privacyMode || (await settingValue("aiPrivacyMode", undefined));
      const explanation = await openRouterService.explainAlert(alert, {
        model,
        privacyMode
      });
      alert.aiExplanation = explanation;
      await alert.save();
      return res.json({ explanation: alert.aiExplanation });
    } catch (error) {
      alert.aiExplanation = {
        status: "error",
        provider: "OpenRouter",
        model: req.body.model,
        generatedAt: new Date(),
        error: error.message
      };
      await alert.save();
      return res.status(error.status || 502).json({
        error: error.message,
        explanation: alert.aiExplanation
      });
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
