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
    const model = openRouterService.resolveOpenRouterModel();

    alert.aiExplanation = {
      status: "requested",
      provider: "OpenRouter",
      model
    };
    await alert.save();

    try {
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
        model: error.model || model,
        generatedAt: new Date(),
        error: error.message,
        content: {
          code: error.code || "AI_EXPLANATION_FAILED",
          providerMessage: error.providerMessage,
          retryAfter: error.retryAfter,
          model: error.model || model
        }
      };
      await alert.save();
      return res.status(error.status || 502).json({
        error: error.message,
        code: error.code || "AI_EXPLANATION_FAILED",
        model: error.model || model,
        retryAfter: error.retryAfter,
        explanation: alert.aiExplanation
      });
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
