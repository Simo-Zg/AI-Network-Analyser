const express = require("express");
const mongoose = require("mongoose");
const Alert = require("../models/Alert");
const alertService = require("../services/alertService");
const siemExportService = require("../services/siemExportService");

const router = express.Router();

function findAlertQuery(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: id }, { eventId: id }] };
  }
  return { eventId: id };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const query = alertService.buildAlertQuery(req.query);
    const alerts = await Alert.find(query).sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ alerts });
  } catch (error) {
    res.json({ alerts: [], warning: `MongoDB unavailable: ${error.message}` });
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const alert = await Alert.findOne(findAlertQuery(req.params.id)).lean();
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    return res.json({ alert });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const allowed = ["reviewed", "false_positive", "confirmed"];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
    }
    const alert = await Alert.findOneAndUpdate(
      findAlertQuery(req.params.id),
      { status: req.body.status },
      { new: true }
    ).lean();
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    return res.json({ alert });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/export", async (req, res, next) => {
  try {
    const alert = await Alert.findOne(findAlertQuery(req.params.id));
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    const filePath = await siemExportService.exportOne(alert);
    return res.json({ filePath, event: siemExportService.normalizeAlert(alert) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
