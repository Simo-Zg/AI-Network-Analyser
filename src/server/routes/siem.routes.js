const express = require("express");
const Alert = require("../models/Alert");
const alertService = require("../services/alertService");
const siemExportService = require("../services/siemExportService");

const router = express.Router();

router.post("/export", async (req, res, next) => {
  try {
    const filters = req.body?.filters || req.body || {};
    const query = alertService.buildAlertQuery(filters);
    const alerts = await Alert.find(query).sort({ timestamp: -1 }).limit(10000);
    const filePath = await siemExportService.exportJsonl(alerts);
    res.json({
      filePath,
      count: alerts.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
