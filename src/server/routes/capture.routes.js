const express = require("express");
const env = require("../config/env");
const CaptureSession = require("../models/CaptureSession");
const pythonService = require("../services/pythonService");
const alertService = require("../services/alertService");
const eventStream = require("../services/eventStreamService");
const { makeSessionId } = require("../utils/ids");

const router = express.Router();

router.post("/start", async (req, res, next) => {
  try {
    const sessionId = makeSessionId();
    const interfaceName = req.body.interfaceName || req.body.interface || env.captureInterface || "";
    const windowSeconds = Number(req.body.windowSeconds || env.captureWindowSeconds || 5);
    const captureFilter = String(req.body.captureFilter || req.body.filter || env.captureFilter || "").trim();
    const dosFlowThreshold = Number(req.body.dosFlowThreshold || env.liveDosFlowThreshold);
    const dosFlowRateThreshold = Number(req.body.dosFlowRateThreshold || env.liveDosFlowRateThreshold);
    const dosSynThreshold = Number(req.body.dosSynThreshold || env.liveDosSynThreshold);
    const dosSynRateThreshold = Number(req.body.dosSynRateThreshold || env.liveDosSynRateThreshold);

    try {
      await CaptureSession.create({
        sessionId,
        startedAt: new Date(),
        status: "running",
        interfaceName,
        captureWindowSeconds: windowSeconds
      });
    } catch (_error) {
      // Capture can still start without MongoDB; status will stream to UI.
    }

    const state = pythonService.startCapture(
      {
        sessionId,
        interfaceName,
        windowSeconds,
        captureFilter,
        dosFlowThreshold,
        dosFlowRateThreshold,
        dosSynThreshold,
        dosSynRateThreshold
      },
      async (event) => {
        eventStream.broadcast(event.type || "capture_event", event);
        if (event.type === "prediction_batch") {
          try {
            await alertService.persistPredictionResult(event, {
              sourceType: "live",
              sessionId,
              rawRef: `capture:${sessionId}`
            });
          } catch (_error) {
            // Storage failures are visible in health; keep streaming live status.
          }
        }
        if (event.type === "capture_status" && ["stopped", "error"].includes(event.status)) {
          try {
            await CaptureSession.updateOne(
              { sessionId },
              {
                status: event.status === "error" ? "error" : "stopped",
                stoppedAt: new Date(),
                error: event.message
              }
            );
          } catch (_error) {
            // Ignore MongoDB unavailability.
          }
        }
      }
    );

    res.json({
      sessionId,
      status: "started",
      capture: state
    });
  } catch (error) {
    next(error);
  }
});

router.post("/stop", async (req, res, next) => {
  try {
    const result = pythonService.stopCapture();
    if (result.sessionId) {
      try {
        await CaptureSession.updateOne(
          { sessionId: result.sessionId },
          { status: "stopped", stoppedAt: new Date() }
        );
      } catch (_error) {
        // Ignore MongoDB unavailability.
      }
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/status", (req, res) => {
  res.json(pythonService.getCaptureStatus());
});

router.get("/interfaces", async (_req, res, next) => {
  try {
    res.json(await pythonService.listCaptureInterfaces());
  } catch (error) {
    next(error);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await CaptureSession.find().sort({ createdAt: -1 }).limit(25).lean();
    res.json({ sessions });
  } catch (error) {
    res.json({ sessions: [], warning: `MongoDB unavailable: ${error.message}` });
  }
});

module.exports = router;
