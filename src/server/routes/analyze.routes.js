const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("../config/env");
const pythonService = require("../services/pythonService");
const alertService = require("../services/alertService");
const eventStream = require("../services/eventStreamService");
const PredictionBatch = require("../models/PredictionBatch");

const router = express.Router();

fs.mkdirSync(env.uploadDir, { recursive: true });

function sanitizeFileName(name) {
  const safeBase = path.basename(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}_${safeBase}`;
}

function fileFilter(allowedExtensions) {
  return (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(", ")}`));
      return;
    }
    cb(null, true);
  };
}

function makeUpload(allowedExtensions) {
  return multer({
    storage: multer.diskStorage({
      destination: env.uploadDir,
      filename: (req, file, cb) => cb(null, sanitizeFileName(file.originalname))
    }),
    limits: {
      fileSize: 250 * 1024 * 1024
    },
    fileFilter: fileFilter(allowedExtensions)
  });
}

async function persistAndRespond(req, res, next, sourceType, analyzer) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No upload file provided" });
    }

    const result = await analyzer(req.file.path);
    let persistence = null;
    try {
      persistence = await alertService.persistPredictionResult(result, {
        sourceType,
        fileName: req.file.originalname,
        rawRef: req.file.path
      });
    } catch (storageError) {
      result.warnings = result.warnings || [];
      result.warnings.push(`MongoDB storage unavailable: ${storageError.message}`);
    }

    eventStream.broadcast("prediction_batch", {
      sourceType,
      summary: result.summary,
      alerts: result.alerts || []
    });

    return res.json({
      ...result,
      stored: Boolean(persistence),
      storedAlertCount: persistence?.alerts?.length || 0
    });
  } catch (error) {
    return next(error);
  }
}

router.post("/csv", makeUpload([".csv"]).single("file"), (req, res, next) =>
  persistAndRespond(req, res, next, "csv", pythonService.analyzeCsv)
);

router.post("/pcap", makeUpload([".pcap", ".pcapng"]).single("file"), (req, res, next) =>
  persistAndRespond(req, res, next, "pcap", pythonService.analyzePcap)
);

router.get("/batches", async (req, res) => {
  try {
    const batches = await PredictionBatch.find().sort({ timestamp: -1 }).limit(100).lean();
    res.json({ batches });
  } catch (error) {
    res.json({ batches: [], warning: `MongoDB unavailable: ${error.message}` });
  }
});

module.exports = router;
